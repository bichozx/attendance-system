import { Injectable } from '@nestjs/common';
import { Actor, AuditLog } from '../../../shared/application/audit-log';
import { PasswordHasher } from '../../auth/domain/ports/password-hasher';
import { RoleNotFoundError } from '../../roles/domain/role.errors';
import { RoleRepository } from '../../roles/domain/role.repository';
import { CompanyUserRepository } from '../domain/company-user.repository';
import {
  PasswordRequiredError,
  UserAlreadyMemberError,
} from '../domain/user.errors';

export interface MemberInput {
  email: string;
  /** Solo se usa si la cuenta no existe. Una cuenta existente conserva su contraseña. */
  password?: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  roleId: string;
}

export interface MemberResult {
  userId: string;
  /** true si el correo ya tenía cuenta (en otra empresa o en esta). */
  existingAccount: boolean;
  /** true si ya era miembro de esta empresa. */
  alreadyMember: boolean;
}

/**
 * Da acceso a una persona a la empresa. Lo usan POST /users y el alta de acceso
 * de empleados, así las reglas de cuentas viven en un solo lugar.
 */
@Injectable()
export class UserAccountsService {
  constructor(
    private readonly users: CompanyUserRepository,
    private readonly roles: RoleRepository,
    private readonly passwords: PasswordHasher,
    private readonly audit: AuditLog,
  ) {}

  normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  findUserIdByEmail(email: string): Promise<string | null> {
    return this.users.findUserIdByEmail(this.normalizeEmail(email));
  }

  /** Igual que ensureMember, pero falla si ya era miembro. */
  async addMember(actor: Actor, input: MemberInput): Promise<MemberResult> {
    const result = await this.ensureMember(actor, input);
    if (result.alreadyMember) throw new UserAlreadyMemberError();
    return result;
  }

  /** Garantiza que la persona sea miembro. Si ya lo era, no cambia su rol. */
  async ensureMember(actor: Actor, input: MemberInput): Promise<MemberResult> {
    const role = await this.roles.findVisible(actor.companyId, input.roleId);
    if (!role) throw new RoleNotFoundError();

    const email = this.normalizeEmail(input.email);
    const existingId = await this.users.findUserIdByEmail(email);

    if (existingId) {
      const member = await this.users.findById(actor.companyId, existingId);
      if (member) {
        return {
          userId: existingId,
          existingAccount: true,
          alreadyMember: true,
        };
      }
      await this.users.addMembership(actor.companyId, existingId, role.id);
      await this.record(actor, existingId, 'user.membership_added', {
        roleId: role.id,
      });
      return {
        userId: existingId,
        existingAccount: true,
        alreadyMember: false,
      };
    }

    if (!input.password) throw new PasswordRequiredError();
    const userId = await this.users.createAccountWithMembership(
      actor.companyId,
      {
        email,
        passwordHash: await this.passwords.hash(input.password),
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        phone: input.phone ?? null,
      },
      role.id,
    );
    await this.record(actor, userId, 'user.created', {
      email,
      roleId: role.id,
    });
    return { userId, existingAccount: false, alreadyMember: false };
  }

  private record(actor: Actor, userId: string, action: string, after: unknown) {
    return this.audit.record({
      companyId: actor.companyId,
      actorUserId: actor.userId,
      action,
      entityType: 'User',
      entityId: userId,
      after, // Nunca se audita la contraseña ni su hash
    });
  }
}
