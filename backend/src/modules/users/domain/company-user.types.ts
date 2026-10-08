export type MembershipStatus = 'INVITED' | 'ACTIVE' | 'DISABLED';

/** Marca de cuenta invitada: no es un hash válido, así que ninguna contraseña coincide. */
export const INVITATION_PENDING = '!invitation-pending';

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
  /** true mientras la persona no haya creado su contraseña con el enlace de invitación. */
  invitationPending: boolean;
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
  /** true cuando la contraseña la definió un admin: se exige cambiarla al entrar. */
  mustChangePassword: boolean;
}
