import type {
  NewRoleData,
  PermissionView,
  RoleChanges,
  RoleView,
} from './role.types';

/**
 * "Visible" = rol del sistema o rol propio de la empresa.
 * Todas las escrituras exigen companyId: nunca se toca un rol de otra empresa.
 */
export abstract class RoleRepository {
  abstract listVisible(companyId: string): Promise<RoleView[]>;
  abstract findVisible(companyId: string, id: string): Promise<RoleView | null>;
  abstract findVisibleByCode(
    companyId: string,
    code: string,
  ): Promise<RoleView | null>;

  abstract listPermissions(): Promise<PermissionView[]>;
  abstract findExistingPermissionCodes(codes: string[]): Promise<string[]>;

  abstract create(companyId: string, data: NewRoleData): Promise<RoleView>;
  abstract update(
    companyId: string,
    id: string,
    changes: RoleChanges,
  ): Promise<RoleView>;
  abstract delete(companyId: string, id: string): Promise<void>;
  abstract countMembers(companyId: string, roleId: string): Promise<number>;
}
