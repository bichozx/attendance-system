export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'LOCKED';

export interface AuthUser {
  id: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  status: UserStatus;
  isPlatformAdmin: boolean;
  mustChangePassword: boolean;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
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

export interface SessionSummary {
  id: string;
  companyId: string | null;
  companyName: string | null;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
  expiresAt: Date;
}

export interface ResetTokenRecord {
  id: string;
  userId: string;
  expiresAt: Date;
  usedAt: Date | null;
}
