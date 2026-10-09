import type { UserStatus } from '../auth.types';

/** Estado vigente de la sesión de un access token, leído de la base en cada petición. */
export interface LiveSessionAccess {
  userId: string;
  companyId: string | null;
  revokedAt: Date | null;
  expiresAt: Date;
  userStatus: UserStatus;
  isPlatformAdmin: boolean;
  mustChangePassword: boolean;
  /**
   * Permisos actuales del rol en la empresa de la sesión. null si ya no hay membresía
   * ACTIVE en una empresa ACTIVE/TRIAL (o la sesión no tiene empresa).
   */
  permissions: string[] | null;
}

export abstract class SessionAccessReader {
  abstract find(sessionId: string): Promise<LiveSessionAccess | null>;
}
