import type {
  ActiveMembership,
  AuthUser,
  NewSession,
  SessionRecord,
} from '../auth.types';

/** Contrato de persistencia de Auth. La implementación vive en infraestructura (Prisma). */
export abstract class AuthRepository {
  abstract findUserByEmail(email: string): Promise<AuthUser | null>;
  abstract findUserById(id: string): Promise<AuthUser | null>;

  /** Solo membresías ACTIVE en empresas ACTIVE/TRIAL no eliminadas. */
  abstract findActiveMemberships(userId: string): Promise<ActiveMembership[]>;

  abstract recordLogin(userId: string): Promise<void>;

  abstract createSession(session: NewSession): Promise<void>;
  abstract findSessionById(id: string): Promise<SessionRecord | null>;

  /**
   * Reemplaza el hash del refresh token solo si el actual coincide y la sesión sigue activa.
   * Devuelve false si otro proceso ya la rotó o revocó (protege contra carreras y reuso).
   */
  abstract rotateSession(
    id: string,
    currentHash: string,
    newHash: string,
    expiresAt: Date,
  ): Promise<boolean>;

  abstract revokeSession(id: string): Promise<void>;
  abstract revokeAllUserSessions(userId: string): Promise<void>;
}
