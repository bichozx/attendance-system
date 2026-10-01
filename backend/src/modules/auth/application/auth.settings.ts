import {
  DEFAULT_SECURITY_POLICY,
  type SecurityPolicy,
} from '../domain/account-security';

/** Configuración de Auth ya parseada. Se construye desde variables de entorno en AuthModule. */
export class AuthSettings {
  constructor(
    readonly accessTokenTtlSeconds: number,
    readonly refreshTokenTtlDays: number,
    readonly security: SecurityPolicy = DEFAULT_SECURITY_POLICY,
    /** Plantilla del enlace de recuperación; {token} se reemplaza. */
    readonly passwordResetUrl = 'asistencia://reset-password?token={token}',
  ) {}

  refreshTokenExpiresAt(from = new Date()): Date {
    return new Date(from.getTime() + this.refreshTokenTtlDays * 86_400_000);
  }

  resetLink(token: string): string {
    return this.passwordResetUrl.replace('{token}', encodeURIComponent(token));
  }
}
