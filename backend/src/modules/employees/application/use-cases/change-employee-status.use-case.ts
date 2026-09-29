import { Injectable } from '@nestjs/common';
import { Actor, AuditLog } from '../../../../shared/application/audit-log';
import { EmployeeRepository } from '../../domain/employee.repository';
import {
  planStatusChange,
  StatusChangeRequest,
} from '../../domain/employee.rules';
import type { EmployeeView } from '../../domain/employee.types';
import { EmployeesService } from '../employees.service';

@Injectable()
export class ChangeEmployeeStatusUseCase {
  constructor(
    private readonly employees: EmployeeRepository,
    private readonly queries: EmployeesService,
    private readonly audit: AuditLog,
  ) {}

  async execute(
    actor: Actor,
    id: string,
    request: StatusChangeRequest,
  ): Promise<EmployeeView> {
    const before = await this.queries.get(actor.companyId, id);
    const change = planStatusChange(before, request);
    if (!change) return before;

    const after = await this.employees.changeStatus(
      actor.companyId,
      id,
      change,
    );
    await this.audit.record({
      companyId: actor.companyId,
      actorUserId: actor.userId,
      action: 'employee.status_changed',
      entityType: 'Employee',
      entityId: id,
      before: {
        status: before.status,
        hireDate: before.hireDate,
        terminationDate: before.terminationDate,
      },
      after: change,
    });
    return after;
  }
}
