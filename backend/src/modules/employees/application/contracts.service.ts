import { Injectable } from '@nestjs/common';
import { Actor, AuditLog } from '../../../shared/application/audit-log';
import {
  formatDateOnly,
  parseDateOnly,
} from '../../../shared/domain/date-only';
import { todayIn } from '../../../shared/domain/zoned-time';
import {
  ContractRepository,
  ContractView,
} from '../domain/contract.repository';
import {
  assertContractData,
  assertEndDateChange,
  ContractNotFoundError,
  ContractPeriod,
  ContractType,
  contractWarnings,
  InvalidContractError,
  planNewContract,
} from '../domain/contract.rules';
import { EmployeeNotActiveError } from '../domain/employee.errors';
import { EmployeeImportRepository } from '../domain/import/employee-import.repository';
import { EmployeesService } from './employees.service';

export interface ContractInput {
  contractType: ContractType;
  startDate: string;
  endDate?: string | null;
  baseSalary: string;
  weeklyHours: number;
  notes?: string | null;
}

/**
 * Historial de contratos (base de la nómina). Un aumento o cambio de condiciones es un
 * contrato NUEVO que cierra el vigente: nunca se sobrescribe un salario pasado.
 */
@Injectable()
export class ContractsService {
  constructor(
    private readonly contracts: ContractRepository,
    private readonly employees: EmployeesService,
    private readonly companies: EmployeeImportRepository,
    private readonly audit: AuditLog,
  ) {}

  async list(companyId: string, employeeId: string) {
    await this.employees.get(companyId, employeeId);
    const today = todayIn(await this.companies.companyTimeZone(companyId));
    const items = await this.contracts.list(companyId, employeeId);
    return items.map((c) => ({ ...c, current: isCurrent(c, today) }));
  }

  async create(actor: Actor, employeeId: string, input: ContractInput) {
    const employee = await this.employees.get(actor.companyId, employeeId);
    if (employee.status === 'TERMINATED') throw new EmployeeNotActiveError();
    const endDate = input.endDate ?? null;
    assertContractData(
      {
        contractType: input.contractType,
        startDate: parseDateOnly(input.startDate),
        endDate: endDate ? parseDateOnly(endDate) : null,
        baseSalary: input.baseSalary,
        weeklyHours: input.weeklyHours,
      },
      employee.hireDate,
    );

    const existing = await this.contracts.list(actor.companyId, employeeId);
    const plan = planNewContract(existing.map(toPeriod), {
      startDate: parseDateOnly(input.startDate),
      endDate: endDate ? parseDateOnly(endDate) : null,
    });
    const close = plan
      ? { id: plan.closeId, endDate: formatDateOnly(plan.closeOn) }
      : null;
    const contract = await this.contracts.create(
      actor.companyId,
      employeeId,
      {
        contractType: input.contractType,
        startDate: input.startDate,
        endDate,
        baseSalary: input.baseSalary,
        weeklyHours: input.weeklyHours.toFixed(2),
        notes: input.notes ?? null,
      },
      close,
    );
    await this.audit.record({
      companyId: actor.companyId,
      actorUserId: actor.userId,
      action: 'contract.created',
      entityType: 'Employee',
      entityId: employeeId,
      before: close ? existing.find((c) => c.id === close.id) : undefined,
      after: { ...contract, closedPrevious: close },
    });
    return {
      contract,
      closedPrevious: close,
      warnings: contractWarnings(input.weeklyHours),
    };
  }

  /** Solo se corrigen notas o la fecha final; salario y tipo cambian con un contrato nuevo. */
  async update(
    actor: Actor,
    employeeId: string,
    id: string,
    changes: { notes?: string | null; endDate?: string | null },
  ) {
    const before = await this.contracts.findById(
      actor.companyId,
      employeeId,
      id,
    );
    if (!before) throw new ContractNotFoundError();
    if (changes.endDate !== undefined) {
      if (
        !changes.endDate &&
        (before.contractType === 'FIXED_TERM' ||
          before.contractType === 'APPRENTICESHIP')
      ) {
        throw new InvalidContractError(
          'Este tipo de contrato requiere fecha final',
        );
      }
      // No puede quedar antes de su inicio ni pisar el contrato siguiente
      const all = await this.contracts.list(actor.companyId, employeeId);
      assertEndDateChange(
        toPeriod(before),
        all.map(toPeriod),
        changes.endDate ? parseDateOnly(changes.endDate) : null,
      );
    }
    const after = await this.contracts.update(actor.companyId, id, changes);
    await this.audit.record({
      companyId: actor.companyId,
      actorUserId: actor.userId,
      action: 'contract.updated',
      entityType: 'Employee',
      entityId: employeeId,
      before,
      after,
    });
    return after;
  }
}

function toPeriod(c: ContractView): ContractPeriod {
  return {
    id: c.id,
    startDate: parseDateOnly(c.startDate),
    endDate: c.endDate ? parseDateOnly(c.endDate) : null,
  };
}

function isCurrent(c: ContractView, today: string) {
  return c.startDate <= today && (c.endDate === null || c.endDate >= today);
}
