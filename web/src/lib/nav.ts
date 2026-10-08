/** Menú del panel. Cada entrada se muestra solo si el rol tiene su permiso. */
export interface NavItem {
  href: string;
  label: string;
  /** null = basta con cualquiera de los permisos de aprobación */
  permission: string | null;
  group: 'daily' | 'admin';
  badge?: 'approvals';
}

export const NAV: NavItem[] = [
  { href: '/', label: 'Hoy', permission: 'reports.read', group: 'daily' },
  { href: '/aprobaciones', label: 'Aprobaciones', permission: null, group: 'daily', badge: 'approvals' },
  { href: '/turnos', label: 'Turnos', permission: 'shifts.read', group: 'daily' },
  { href: '/empleados', label: 'Empleados', permission: 'employees.read', group: 'daily' },
  { href: '/reportes', label: 'Reportes', permission: 'reports.read', group: 'daily' },
  { href: '/establecimientos', label: 'Establecimientos', permission: 'stores.read', group: 'admin' },
  { href: '/usuarios', label: 'Usuarios', permission: 'users.read', group: 'admin' },
  { href: '/roles', label: 'Roles y permisos', permission: 'roles.read', group: 'admin' },
  { href: '/empresa', label: 'Empresa', permission: 'companies.read', group: 'admin' },
  { href: '/auditoria', label: 'Auditoría', permission: 'audit.read', group: 'admin' },
];

export const APPROVAL_PERMISSIONS = ['attendance.adjust', 'incidents.approve', 'shift_changes.approve'];
