export type NotificationType =
  | 'SHIFT_REMINDER'
  | 'SHIFT_STARTED'
  | 'CLOCK_OUT_REMINDER'
  | 'MISSING_CLOCK_IN'
  | 'MISSING_CLOCK_OUT'
  | 'SHIFT_CHANGED'
  | 'SCHEDULE_PUBLISHED'
  | 'INCIDENT_RESOLVED'
  | 'ADMIN_ANNOUNCEMENT';

export interface NotificationRequest {
  companyId: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** Si ya existe una notificación con esta clave, no se crea otra (recordatorios). */
  dedupeKey?: string;
  /** Enviar a partir de esta hora (por defecto, de inmediato). */
  scheduledFor?: Date;
}

/**
 * Encola notificaciones (quedan PENDING en la base).
 * El módulo de notificaciones las enviará por push (FCM) en su fase.
 */
export abstract class Notifier {
  abstract notify(requests: NotificationRequest[]): Promise<void>;
}
