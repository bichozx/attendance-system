export interface RoleView {
  id: string;
  code: string;
  name: string;
  description: string | null;
  /** Roles del sistema: compartidos por todas las empresas y de solo lectura. */
  isSystem: boolean;
  permissions: string[];
}

export interface PermissionView {
  code: string;
  module: string;
  description: string | null;
}

export interface NewRoleData {
  code: string;
  name: string;
  description: string | null;
  permissions: string[];
}

export interface RoleChanges {
  name?: string;
  description?: string | null;
  permissions?: string[];
}
