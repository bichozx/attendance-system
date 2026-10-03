import { Injectable } from '@nestjs/common';
import { Actor, AuditLog } from '../../../shared/application/audit-log';
import { DomainError } from '../../../shared/domain/domain-error';
import { todayIn } from '../../../shared/domain/zoned-time';
import { RoleRepository } from '../../roles/domain/role.repository';
import { UserAccountsService } from '../../users/application/user-accounts.service';
import { UserAlreadyLinkedError } from '../domain/employee.errors';
import { EmployeeRepository } from '../domain/employee.repository';
import { EmployeeImportRepository } from '../domain/import/employee-import.repository';
import {
  REQUIRED_COLUMNS,
  RowResult,
  validateRows,
} from '../domain/import/employee-import.rules';
import {
  ImportFileError,
  SpreadsheetIO,
} from '../infrastructure/import/spreadsheet.io';

export class ImportHasErrorsError extends DomainError {
  readonly code = 'IMPORT_HAS_ERRORS';
  readonly kind = 'VALIDATION';
}

export class ImportContractsForbiddenError extends DomainError {
  readonly code = 'IMPORT_CONTRACTS_FORBIDDEN';
  readonly kind = 'FORBIDDEN';
  constructor() {
    super(
      'Para cargar contratos y salarios necesita el permiso contracts.manage',
    );
  }
}

export class ImportAccessForbiddenError extends DomainError {
  readonly code = 'IMPORT_ACCESS_FORBIDDEN';
  readonly kind = 'FORBIDDEN';
  constructor() {
    super(
      'Para dar acceso a la app (acceso_app = SI) necesita el permiso users.manage',
    );
  }
}

export interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  size: number;
}

const MAX_ERRORS_IN_RESPONSE = 300;

@Injectable()
export class EmployeeImportService {
  constructor(
    private readonly io: SpreadsheetIO,
    private readonly repo: EmployeeImportRepository,
    private readonly employees: EmployeeRepository,
    private readonly accounts: UserAccountsService,
    private readonly roles: RoleRepository,
    private readonly audit: AuditLog,
  ) {}

  async template(companyId: string, format: 'xlsx' | 'csv') {
    return format === 'csv'
      ? this.io.templateCsv()
      : this.io.template(await this.repo.templateLists(companyId));
  }

  /** Valida sin guardar nada. */
  async preview(companyId: string, file: UploadedFile) {
    const { results } = await this.validate(companyId, file);
    return summarize(results);
  }

  /** El mismo archivo con una columna de errores, para corregir y volver a subir. */
  async errorReport(companyId: string, file: UploadedFile) {
    const { headers, results } = await this.validate(companyId, file);
    return this.io.errorReport(headers, results);
  }

  /**
   * Todo o nada por defecto: si hay errores, no se guarda ninguna fila.
   * Con skipInvalid se guardan solo las válidas.
   */
  async import(
    actor: Actor & { permissions: string[] },
    file: UploadedFile,
    skipInvalid: boolean,
  ) {
    const { results } = await this.validate(actor.companyId, file);
    const summary = summarize(results);
    if (summary.invalid > 0 && !skipInvalid) {
      throw new ImportHasErrorsError(
        `El archivo tiene ${summary.invalid} fila(s) con errores; no se importó nada`,
        summary as unknown as Record<string, unknown>,
      );
    }
    const valid = results.flatMap((r) => (r.data ? [r.data] : []));
    if (
      valid.some((v) => v.appAccess) &&
      !actor.permissions.includes('users.manage')
    ) {
      throw new ImportAccessForbiddenError();
    }
    // Los salarios son información sensible: cargarlos exige el mismo permiso que editarlos
    if (
      valid.some((v) => v.contract) &&
      !actor.permissions.includes('contracts.manage')
    ) {
      throw new ImportContractsForbiddenError();
    }
    if (valid.length === 0)
      throw new ImportFileError('No hay filas válidas para importar');

    const ids = await this.repo.createMany(actor.companyId, valid);

    // Acceso a la app: invitación por correo (fuera de la transacción: si un correo falla,
    // los empleados igual quedan creados y se puede dar acceso después desde su ficha)
    const warnings: string[] = [];
    let invited = 0;
    const toInvite = valid.filter((v) => v.appAccess);
    if (toInvite.length) {
      const role = await this.roles.findVisibleByCode(
        actor.companyId,
        'EMPLOYEE',
      );
      for (const e of toInvite) {
        try {
          const member = await this.accounts.inviteMember(actor, {
            email: e.email!,
            firstName: e.firstName,
            lastName: e.lastName,
            phone: e.phone,
            roleId: role!.id,
          });
          await this.employees.linkUser(
            actor.companyId,
            ids.get(e.code)!,
            member.userId,
          );
          invited++;
        } catch (error) {
          warnings.push(
            error instanceof UserAlreadyLinkedError
              ? `${e.code}: el correo ${e.email} ya está vinculado a otro empleado; no se dio acceso`
              : `${e.code}: no se pudo dar acceso (${(error as Error).message})`,
          );
        }
      }
    }

    await this.audit.record({
      companyId: actor.companyId,
      actorUserId: actor.userId,
      action: 'employee.imported',
      entityType: 'Employee',
      entityId: actor.companyId,
      after: {
        file: file.originalname,
        created: ids.size,
        skipped: summary.invalid,
        withContract: valid.filter((v) => v.contract).length,
        invited,
      },
    });
    return {
      created: ids.size,
      skipped: summary.invalid,
      withContract: valid.filter((v) => v.contract).length,
      invited,
      warnings,
    };
  }

  private async validate(companyId: string, file: UploadedFile) {
    const sheet = await this.io.read(file);
    const missing = REQUIRED_COLUMNS.filter((c) => !sheet.headers.includes(c));
    if (missing.length) {
      throw new ImportFileError(
        `Faltan columnas obligatorias: ${missing.join(', ')}. Descargue la plantilla.`,
      );
    }
    if (sheet.rows.length === 0)
      throw new ImportFileError('El archivo no tiene filas de datos');
    const today = todayIn(await this.repo.companyTimeZone(companyId));
    const results = validateRows(
      sheet.rows,
      await this.repo.context(companyId, today),
    );
    return { headers: sheet.headers, results };
  }
}

function summarize(results: RowResult[]) {
  const invalid = results.filter((r) => r.errors.length);
  return {
    total: results.length,
    valid: results.length - invalid.length,
    invalid: invalid.length,
    withContract: results.filter((r) => r.data?.contract).length,
    withAppAccess: results.filter((r) => r.data?.appAccess).length,
    errors: invalid
      .slice(0, MAX_ERRORS_IN_RESPONSE)
      .map((r) => ({ row: r.row, code: r.raw.codigo, errors: r.errors })),
  };
}
