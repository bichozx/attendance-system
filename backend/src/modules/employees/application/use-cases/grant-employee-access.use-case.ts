import { Injectable } from '@nestjs/common';
import { Actor, AuditLog } from '../../../../shared/application/audit-log';
import { RoleNotFoundError } from '../../../roles/domain/role.errors';
import { RoleRepository } from '../../../roles/domain/role.repository';
import { UserAccountsService } from '../../../users/application/user-accounts.service';
import {
  EmailRequiredError,
  EmployeeAlreadyHasAccessError,
  EmployeeNotActiveError,
  UserAlreadyLinkedError,
} from '../../domain/employee.errors';
import { EmployeeRepository } from '../../domain/employee.repository';
import { blocksAppAccess } from '../../domain/employee.rules';
import { EmployeesService } from '../employees.service';

export interface GrantAccessInput {
  /** Si no se envía, se usa el correo del empleado. */
  email?: string;
  /** Solo para cuentas nuevas. */
  password?: string;
  /** Si no se envía, rol EMPLOYEE. */
  roleId?: string;
}

/** Da acceso a la app móvil a un empleado: crea (o reutiliza) su cuenta y la vincula. */
@Injectable()
export class GrantEmployeeAccessUseCase {
  constructor(
    private readonly employees: EmployeeRepository,
    private readonly queries: EmployeesService,
    private readonly accounts: UserAccountsService,
    private readonly roles: RoleRepository,
    private readonly audit: AuditLog,
  ) {}

  async execute(actor: Actor, employeeId: string, input: GrantAccessInput) {
    const employee = await this.queries.get(actor.companyId, employeeId);
    if (employee.userId) throw new EmployeeAlreadyHasAccessError();
    if (blocksAppAccess(employee.status)) throw new EmployeeNotActiveError();

    const email = input.email ?? employee.email;
    if (!email) throw new EmailRequiredError();

    // La cuenta podría existir ya y estar vinculada a otro empleado de esta empresa
    const existingUserId = await this.accounts.findUserIdByEmail(email);
    if (
      existingUserId &&
      (await this.employees.findIdByUserId(actor.companyId, existingUserId))
    ) {
      throw new UserAlreadyLinkedError();
    }

    const roleId = input.roleId ?? (await this.defaultRoleId(actor.companyId));
    const member = await this.accounts.ensureMember(actor, {
      email,
      password: input.password,
      firstName: employee.firstName,
      lastName: employee.lastName,
      phone: employee.phone,
      roleId,
    });

    await this.employees.linkUser(actor.companyId, employeeId, member.userId);
    await this.audit.record({
      companyId: actor.companyId,
      actorUserId: actor.userId,
      action: 'employee.access_granted',
      entityType: 'Employee',
      entityId: employeeId,
      after: {
        userId: member.userId,
        email: this.accounts.normalizeEmail(email),
      },
    });

    return {
      employee: await this.queries.get(actor.companyId, employeeId),
      existingAccount: member.existingAccount,
    };
  }

  private async defaultRoleId(companyId: string): Promise<string> {
    const role = await this.roles.findVisibleByCode(companyId, 'EMPLOYEE');
    if (!role) throw new RoleNotFoundError();
    return role.id;
  }
}
