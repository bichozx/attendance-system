export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'LOCKED';

export interface AuthUser {
  id: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  status: UserStatus;
  isPlatformAdmin: boolean;
}

/** Pertenencia activa de un usuario a una empresa activa, con sus permisos resueltos. */
export interface ActiveMembership {
  companyId: string;
  companyName: string;
  companySlug: string;
  roleCode: string;
  roleName: string;
  permissions: string[];
}

export interface SessionRecord {
  id: string;
  userId: string;
  companyId: string | null;
  refreshTokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface NewSession {
  id: string;
  userId: string;
  companyId: string | null;
  refreshTokenHash: string;
  expiresAt: Date;
  userAgent?: string;
  ipAddress?: string;
}
