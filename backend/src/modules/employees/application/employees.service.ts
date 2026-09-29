import { Injectable } from '@nestjs/common';
import { Actor, AuditLog } from '../../../shared/application/audit-log';
import { PageRequest, toPage } from '../../../shared/application/page';
import {
  EmployeeCodeTakenError,
  EmployeeDocumentTakenError,
  EmployeeNotFoundError,
  InvalidReferenceError,
} from '../domain/employee.errors';
import { EmployeeRepository } from '../domain/employee.repository';
import { assertEmployeeDates } from '../domain/employee.rules';
import type {
  EmployeeChanges,
  EmployeeData,
  EmployeeFilter,
  EmployeeView,
} from '../domain/employee.types';

@Injectable()
export class EmployeesService {
  constructor(
    private readonly employees: EmployeeRepository,
    private readonly audit: AuditLog,
  ) {}

  async list(companyId: string, filter: EmployeeFilter, page: PageRequest) {
    const { items, total } = await this.employees.list(companyId, filter, page);
    return toPage(items, total, page);
  }

  async get(companyId: string, id: string): Promise<EmployeeView> {
    const employee = await this.employees.findById(companyId, id);
    if (!employee) throw new EmployeeNotFoundError();
    return employee;
  }

  async create(actor: Actor, data: EmployeeData): Promise<EmployeeView> {
    assertEmployeeDates({ ...data, terminationDate: null });
    await this.assertUnique(actor.companyId, data);
    await this.assertReferences(actor.companyId, data);

    const employee = await this.employees.create(actor.companyId, data);
    await this.record(
      actor,
      employee.id,
      'employee.created',
      undefined,
      employee,
    );
    return employee;
  }

  async update(
    actor: Actor,
    id: string,
    changes: EmployeeChanges,
  ): Promise<EmployeeView> {
    const before = await this.get(actor.companyId, id);

    assertEmployeeDates({
      birthDate:
        changes.birthDate !== undefined ? changes.birthDate : before.birthDate,
      hireDate: changes.hireDate ?? before.hireDate,
      terminationDate: before.terminationDate,
    });
    await this.assertUnique(
      actor.companyId,
      {
        code: changes.code,
        documentType: changes.documentType ?? before.documentType,
        documentNumber: changes.documentNumber ?? before.documentNumber,
      },
      id,
    );
    await this.assertReferences(actor.companyId, changes);

    const after = await this.employees.update(actor.companyId, id, changes);
    await this.record(actor, id, 'employee.updated', before, after);
    return after;
  }

  private async assertUnique(
    companyId: string,
    data: Pick<
      Partial<EmployeeData>,
      'code' | 'documentType' | 'documentNumber'
    >,
    excludeId?: string,
  ) {
    if (data.code) {
      const owner = await this.employees.findIdByCode(companyId, data.code);
      if (owner && owner !== excludeId)
        throw new EmployeeCodeTakenError(data.code);
    }
    if (data.documentType && data.documentNumber) {
      const owner = await this.employees.findIdByDocument(
        companyId,
        data.documentType,
        data.documentNumber,
      );
      if (owner && owner !== excludeId) throw new EmployeeDocumentTakenError();
    }
  }

  /** Impide referenciar cargos o tiendas de OTRA empresa (fuga entre tenants). */
  private async assertReferences(
    companyId: string,
    refs: { positionId?: string | null; defaultStoreId?: string | null },
  ) {
    if (
      refs.positionId &&
      !(await this.employees.positionExists(companyId, refs.positionId))
    ) {
      throw new InvalidReferenceError('positionId');
    }
    if (
      refs.defaultStoreId &&
      !(await this.employees.storeExists(companyId, refs.defaultStoreId))
    ) {
      throw new InvalidReferenceError('defaultStoreId');
    }
  }

  private record(
    actor: Actor,
    id: string,
    action: string,
    before: unknown,
    after: unknown,
  ) {
    return this.audit.record({
      companyId: actor.companyId,
      actorUserId: actor.userId,
      action,
      entityType: 'Employee',
      entityId: id,
      before,
      after,
    });
  }
}
