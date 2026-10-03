/** Reglas de seguridad de la cuenta (puras: sin base de datos ni reloj global). */

export interface SecurityPolicy {
  /** Intentos fallidos seguidos antes de bloquear. */
  maxFailedLogins: number;
  /** Duración del bloqueo temporal. */
  lockMinutes: number;
  /** Vigencia del enlace de recuperación. */
  resetTokenTtlMinutes: number;
  /** Máximo de enlaces de recuperación por usuario y hora (evita inundar su correo). */
  maxResetRequestsPerHour: number;
  /** Vigencia del enlace de bienvenida para crear la contraseña. */
  inviteTokenTtlHours: number;
}

export const DEFAULT_SECURITY_POLICY: SecurityPolicy = {
  maxFailedLogins: 5,
  lockMinutes: 15,
  resetTokenTtlMinutes: 30,
  maxResetRequestsPerHour: 3,
  inviteTokenTtlHours: 72,
};

export function isLocked(lockedUntil: Date | null, now: Date): boolean {
  return lockedUntil !== null && lockedUntil > now;
}

/** Tras un intento fallido: ¿queda bloqueada? Devuelve hasta cuándo, o null. */
export function lockAfterFailure(
  attempts: number,
  policy: SecurityPolicy,
  now: Date,
): Date | null {
  return attempts >= policy.maxFailedLogins
    ? new Date(now.getTime() + policy.lockMinutes * 60_000)
    : null;
}

export function secondsUntil(date: Date, now: Date): number {
  return Math.max(0, Math.ceil((date.getTime() - now.getTime()) / 1000));
}
