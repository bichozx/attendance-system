import { Injectable } from '@nestjs/common';
import { Actor, AuditLog } from '../../../shared/application/audit-log';
import {
  RoleCodeTakenError,
  RoleInUseError,
  RoleNotFoundError,
  SystemRoleReadOnlyError,
  UnknownPermissionsError,
} from '../domain/role.errors';
import { RoleRepository } from '../domain/role.repository';
import type { NewRoleData, RoleChanges, RoleView } from '../domain/role.types';

@Injectable()
export class RolesService {
  constructor(
    private readonly roles: RoleRepository,
    private readonly audit: AuditLog,
  ) {}

  list(companyId: string) {
    return this.roles.listVisible(companyId);
  }

  listPermissions() {
    return this.roles.listPermissions();
  }

  async get(companyId: string, id: string): Promise<RoleView> {
    const role = await this.roles.findVisible(companyId, id);
    if (!role) throw new RoleNotFoundError();
    return role;
  }

  async create(actor: Actor, input: NewRoleData): Promise<RoleView> {
    const code = input.code.trim().toUpperCase();
    // También bloquea códigos iguales a los del sistema (EMPLOYEE, SUPERVISOR...)
    if (await this.roles.findVisibleByCode(actor.companyId, code)) {
      throw new RoleCodeTakenError(code);
    }
    const permissions = await this.validPermissions(input.permissions);

    const role = await this.roles.create(actor.companyId, {
      ...input,
      code,
      permissions,
    });
    await this.audit.record({
      ...this.auditBase(actor, role.id, 'role.created'),
      after: role,
    });
    return role;
  }

  async update(actor: Actor, id: string, changes: RoleChanges) {
    const before = await this.getEditable(actor.companyId, id);
    const permissions = changes.permissions
      ? await this.validPermissions(changes.permissions)
      : undefined;

    const after = await this.roles.update(actor.companyId, id, {
      ...changes,
      permissions,
    });
    await this.audit.record({
      ...this.auditBase(actor, id, 'role.updated'),
      before,
      after,
    });
    // Los usuarios con este rol reciben los permisos nuevos en su próximo refresh (≤ 15 min).
    return after;
  }

  async delete(actor: Actor, id: string): Promise<void> {
    const before = await this.getEditable(actor.companyId, id);
    const members = await this.roles.countMembers(actor.companyId, id);
    if (members > 0) throw new RoleInUseError(members);

    await this.roles.delete(actor.companyId, id);
    await this.audit.record({
      ...this.auditBase(actor, id, 'role.deleted'),
      before,
    });
  }

  private async getEditable(companyId: string, id: string) {
    const role = await this.get(companyId, id);
    if (role.isSystem) throw new SystemRoleReadOnlyError();
    return role;
  }

  private async validPermissions(codes: string[]): Promise<string[]> {
    const unique = [...new Set(codes)];
    const existing = new Set(
      await this.roles.findExistingPermissionCodes(unique),
    );
    const unknown = unique.filter((c) => !existing.has(c));
    if (unknown.length) throw new UnknownPermissionsError(unknown);
    return unique;
  }

  private auditBase(actor: Actor, roleId: string, action: string) {
    return {
      companyId: actor.companyId,
      actorUserId: actor.userId,
      action,
      entityType: 'Role',
      entityId: roleId,
    };
  }
}
