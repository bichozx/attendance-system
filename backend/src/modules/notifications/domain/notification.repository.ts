import type { PageRequest } from '../../../shared/application/page';
import type { ReminderCandidate } from './reminder.rules';

export interface DispatchItem {
  id: string;
  companyId: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  /** Intentos INCLUYENDO el actual. */
  attempts: number;
}

export interface InboxItem {
  id: string;
  type: string;
  title: string;
  body: string;
  data: unknown;
  readAt: Date | null;
  createdAt: Date;
}

export abstract class NotificationRepository {
  // --- Despacho (outbox) ---

  /**
   * Toma hasta `limit` notificaciones pendientes y vencidas, y las "arrienda" hasta
   * `leaseUntil` (FOR UPDATE SKIP LOCKED): ninguna otra instancia las toma mientras tanto,
   * y si este proceso muere, se reintentan al vencer el arriendo.
   */
  abstract claimDue(
    now: Date,
    limit: number,
    leaseUntil: Date,
  ): Promise<DispatchItem[]>;
  /** Tokens de dispositivos con sesión ACTIVA en esa empresa. */
  abstract activeDeviceTokens(
    companyId: string,
    userId: string,
    now: Date,
  ): Promise<string[]>;
  abstract markSent(
    id: string,
    pushedDevices: number,
    note: string | null,
  ): Promise<void>;
  abstract markRetry(
    id: string,
    nextAttemptAt: Date,
    error: string,
  ): Promise<void>;
  abstract markFailed(id: string, error: string): Promise<void>;
  abstract deleteDeviceTokens(tokens: string[]): Promise<number>;

  // --- Recibos del proveedor ---
  abstract saveTickets(tickets: { id: string; token: string }[]): Promise<void>;
  abstract ticketsOlderThan(
    date: Date,
    limit: number,
  ): Promise<{ id: string; token: string }[]>;
  abstract deleteTickets(ids: string[]): Promise<void>;
  abstract deleteTicketsCreatedBefore(date: Date): Promise<void>;

  // --- Recordatorios ---
  /** Asignaciones de turnos (visibles, de empresas operando) que se cruzan con el rango. */
  abstract reminderCandidates(
    from: Date,
    to: Date,
  ): Promise<ReminderCandidate[]>;

  // --- Bandeja del usuario ---
  abstract inbox(
    companyId: string,
    userId: string,
    unreadOnly: boolean,
    page: PageRequest,
  ): Promise<{ items: InboxItem[]; total: number }>;
  abstract unreadCount(companyId: string, userId: string): Promise<number>;
  abstract markRead(
    companyId: string,
    userId: string,
    id: string,
  ): Promise<boolean>;
  abstract markAllRead(companyId: string, userId: string): Promise<number>;

  // --- Dispositivos ---
  abstract registerDevice(data: {
    userId: string;
    sessionId: string;
    token: string;
    platform: 'IOS' | 'ANDROID' | 'WEB';
  }): Promise<void>;
  abstract unregisterDevice(userId: string, token: string): Promise<boolean>;

  // --- Avisos administrativos ---
  /** Usuarios destinatarios con acceso ACTIVO a la empresa. */
  abstract audienceUserIds(
    companyId: string,
    audience: { storeIds?: string[]; employeeIds?: string[] },
  ): Promise<string[]>;
}
