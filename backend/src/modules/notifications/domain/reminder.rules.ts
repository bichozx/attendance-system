import { utcToLocal } from '../../../shared/domain/zoned-time';
import type { NotificationRequest } from '../../../shared/application/notifier';

export const REMINDER_POLICY = {
  /** "Tu turno empieza pronto" (coincide con la anticipación de marcación por defecto). */
  leadMinutes: 5,
  /** Aviso de entrada no registrada: minutos después del inicio (o de la tolerancia, si es mayor). */
  missingClockInAfterMinutes: 10,
  /** Recordatorio de salida: ventana tras el fin del turno. */
  clockOutWindowMinutes: 60,
} as const;

export interface ReminderCandidate {
  assignmentId: string;
  shiftId: string;
  companyId: string;
  userId: string;
  storeName: string;
  timeZone: string;
  startsAt: Date;
  endsAt: Date;
  lateToleranceMinutes: number;
  clockInAt: Date | null;
  attendanceStatus: string | null;
}

const MIN = 60_000;
const at = (d: Date, tz: string) => utcToLocal(d, tz).time;

/**
 * Recordatorios que corresponden en `now`. Cada uno lleva una dedupeKey por asignación:
 * aunque el proceso corra cada minuto (o en varias instancias), se envía una sola vez.
 * Si el servidor estuvo apagado, NO se envían recordatorios viejos: cada uno tiene ventana.
 */
export function dueReminders(
  candidates: ReminderCandidate[],
  now: Date,
  policy = REMINDER_POLICY,
): NotificationRequest[] {
  const out: NotificationRequest[] = [];
  const t = now.getTime();

  for (const c of candidates) {
    const start = c.startsAt.getTime();
    const end = c.endsAt.getTime();
    const base = {
      companyId: c.companyId,
      userId: c.userId,
      data: { shiftId: c.shiftId },
    };

    if (!c.clockInAt && t >= start - policy.leadMinutes * MIN && t < start) {
      out.push({
        ...base,
        type: 'SHIFT_REMINDER',
        dedupeKey: `shift-reminder:${c.assignmentId}`,
        title: 'Tu turno empieza pronto',
        body: `A las ${at(c.startsAt, c.timeZone)} en ${c.storeName}. Ya puedes marcar tu entrada.`,
      });
    }

    const missingAfter = Math.max(
      policy.missingClockInAfterMinutes,
      c.lateToleranceMinutes + 1,
    );
    if (!c.clockInAt && t >= start + missingAfter * MIN && t < end) {
      out.push({
        ...base,
        type: 'MISSING_CLOCK_IN',
        dedupeKey: `missing-clock-in:${c.assignmentId}`,
        title: 'No has marcado tu entrada',
        body: `Tu turno en ${c.storeName} empezó a las ${at(c.startsAt, c.timeZone)}. Si ya estás ahí, marca ahora.`,
      });
    }

    if (
      c.attendanceStatus === 'IN_PROGRESS' &&
      t >= end &&
      t < end + policy.clockOutWindowMinutes * MIN
    ) {
      out.push({
        ...base,
        type: 'CLOCK_OUT_REMINDER',
        dedupeKey: `clock-out:${c.assignmentId}`,
        title: 'Recuerda marcar tu salida',
        body: `Tu turno en ${c.storeName} terminó a las ${at(c.endsAt, c.timeZone)}.`,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------
// Reintentos del envío push
// ---------------------------------------------------------------------

/** Espera antes del siguiente intento según los intentos ya hechos. */
const BACKOFF_MINUTES = [1, 5, 15, 60];
export const MAX_PUSH_ATTEMPTS = BACKOFF_MINUTES.length + 1;

export function nextRetryAt(attempts: number, now: Date): Date | null {
  if (attempts >= MAX_PUSH_ATTEMPTS) return null; // agotado → FAILED
  const minutes =
    BACKOFF_MINUTES[Math.min(attempts - 1, BACKOFF_MINUTES.length - 1)];
  return new Date(now.getTime() + minutes * MIN);
}
