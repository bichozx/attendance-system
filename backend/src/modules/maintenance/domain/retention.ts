/** Plazos de retención. Los valores por defecto se pueden cambiar por variables de entorno. */
export interface RetentionPolicy {
  /** Pasado este plazo se borran las coordenadas GPS (se conserva hora, resultado y si estaba dentro). */
  locationDays: number;
  /** Notificaciones de la bandeja. */
  notificationDays: number;
  /** Sesiones cerradas o vencidas. */
  sessionDays: number;
  /** Enlaces de recuperación vencidos o usados. */
  resetTokenDays: number;
}

export const DEFAULT_RETENTION: RetentionPolicy = {
  locationDays: 365,
  notificationDays: 180,
  sessionDays: 30,
  resetTokenDays: 7,
};

const DAY = 86_400_000;

export function cutoffs(policy: RetentionPolicy, now: Date) {
  const before = (days: number) => new Date(now.getTime() - days * DAY);
  return {
    location: before(policy.locationDays),
    notifications: before(policy.notificationDays),
    sessions: before(policy.sessionDays),
    resetTokens: before(policy.resetTokenDays),
  };
}
