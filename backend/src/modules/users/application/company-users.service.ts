import { Injectable } from '@nestjs/common';
import { Actor, AuditLog } from '../../../shared/application/audit-log';
import { PageRequest, toPage } from '../../../shared/application/page';
import { RoleNotFoundError } from '../../roles/domain/role.errors';
import { RoleRepository } from '../../roles/domain/role.repository';
import { CompanyUserRepository } from '../domain/company-user.repository';
import type {
  CompanyUserFilter,
  CompanyUserView,
} from '../domain/company-user.types';
import {
  CannotModifySelfError,
  CompanyUserNotFoundError,
} from '../domain/user.errors';
import { MemberInput, UserAccountsService } from './user-accounts.service';

@Injectable()
export class CompanyUsersService {
  constructor(
    private readonly users: CompanyUserRepository,
    private readonly roles: RoleRepository,
    private readonly accounts: UserAccountsService,
    private readonly audit: AuditLog,
  ) {}

  async list(companyId: string, filter: CompanyUserFilter, page: PageRequest) {
    const { items, total } = await this.users.list(companyId, filter, page);
    return toPage(items, total, page);
  }

  async get(companyId: string, userId: string): Promise<CompanyUserView> {
    const user = await this.users.findById(companyId, userId);
    if (!user) throw new CompanyUserNotFoundError();
    return user;
  }

  async create(actor: Actor, input: MemberInput) {
    const { userId, existingAccount, invited } = await this.accounts.addMember(
      actor,
      input,
    );
    return {
      user: await this.get(actor.companyId, userId),
      existingAccount,
      invited,
    };
  }

  /**
   * Enlace de acceso: si la persona aún no creó su contraseña se le reenvía la invitación
   * (vigencia larga); si ya la tiene, el enlace de recuperación de siempre.
   */
  async sendAccessLink(
    actor: Actor,
    userId: string,
  ): Promise<'invitation' | 'reset'> {
    const user = await this.get(actor.companyId, userId);
    if (user.invitationPending) {
      await this.accounts.resendInvitation(actor, userId);
      return 'invitation';
    }
    return 'reset';
  }

  async changeRole(actor: Actor, userId: string, roleId: string) {
    if (userId === actor.userId) throw new CannotModifySelfError();
    const before = await this.get(actor.companyId, userId);
    const role = await this.roles.findVisible(actor.companyId, roleId);
    if (!role) throw new RoleNotFoundError();

    await this.users.updateMembership(actor.companyId, userId, {
      roleId: role.id,
    });
    const after = await this.get(actor.companyId, userId);
    await this.record(
      actor,
      userId,
      'user.role_changed',
      before.role,
      after.role,
    );
    return after;
  }

  async changeStatus(
    actor: Actor,
    userId: string,
    status: 'ACTIVE' | 'DISABLED',
  ) {
    if (userId === actor.userId) throw new CannotModifySelfError();
    const before = await this.get(actor.companyId, userId);
    if (before.membershipStatus === status) return before;

    await this.users.updateMembership(actor.companyId, userId, { status });
    // Al desactivar, se cortan sus sesiones en esta empresa de inmediato.
    if (status === 'DISABLED') {
      await this.users.revokeCompanySessions(actor.companyId, userId);
    }
    await this.record(
      actor,
      userId,
      'user.status_changed',
      { status: before.membershipStatus },
      { status },
    );
    return this.get(actor.companyId, userId);
  }

  private record(
    actor: Actor,
    userId: string,
    action: string,
    before: unknown,
    after: unknown,
  ) {
    return this.audit.record({
      companyId: actor.companyId,
      actorUserId: actor.userId,
      action,
      entityType: 'User',
      entityId: userId,
      before,
      after,
    });
  }
}
