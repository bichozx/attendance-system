export type MembershipStatus = 'INVITED' | 'ACTIVE' | 'DISABLED';

/** Un usuario visto desde una empresa: su cuenta + su membresía en esa empresa. */
export interface CompanyUserView {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  /** Estado de la cuenta global (lo gestiona la plataforma). */
  accountStatus: 'ACTIVE' | 'INACTIVE' | 'LOCKED';
  /** Estado dentro de esta empresa (lo gestiona el admin de la empresa). */
  membershipStatus: MembershipStatus;
  role: { id: string; code: string; name: string };
  /** Empleado vinculado en esta empresa, si existe. */
  employeeId: string | null;
  lastLoginAt: Date | null;
  memberSince: Date;
}

export interface CompanyUserFilter {
  search?: string;
  status?: MembershipStatus;
  roleId?: string;
}

export interface NewAccount {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  phone: string | null;
}
