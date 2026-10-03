import type { SecurityPolicy } from '../account-security';
import type {
  ActiveMembership,
  AuthUser,
  NewSession,
  ResetTokenRecord,
  SessionRecord,
  SessionSummary,
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

  // --- Seguridad de la cuenta ---

  /** Suma un intento fallido de forma atómica y bloquea si llega al máximo. */
  abstract registerFailedLogin(
    userId: string,
    policy: SecurityPolicy,
    now: Date,
  ): Promise<{ attempts: number; lockedUntil: Date | null }>;
  abstract clearLoginFailures(userId: string): Promise<void>;

  /** Guarda el nuevo hash, quita la marca de contraseña temporal y desbloquea. */
  abstract updatePassword(userId: string, passwordHash: string): Promise<void>;

  abstract revokeOtherSessions(
    userId: string,
    keepSessionId: string,
  ): Promise<number>;
  abstract listActiveSessions(userId: string): Promise<SessionSummary[]>;
  /** Solo si la sesión es del usuario. Devuelve false si no existe o ya estaba cerrada. */
  abstract revokeUserSession(
    userId: string,
    sessionId: string,
  ): Promise<boolean>;

  // --- Recuperación de contraseña ---

  abstract countResetTokensSince(userId: string, since: Date): Promise<number>;
  /** Crea un enlace nuevo e invalida los anteriores sin usar. */
  abstract createResetToken(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    requestedIp?: string;
  }): Promise<void>;
  abstract findResetToken(tokenHash: string): Promise<ResetTokenRecord | null>;
  /** Marca el enlace como usado solo si aún no lo estaba (un solo uso, incluso en carreras). */
  abstract consumeResetToken(id: string): Promise<boolean>;
}
