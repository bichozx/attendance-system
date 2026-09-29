import { clockWindow, evaluateClockIn } from '../../shifts/domain/shift.rules';
import type { ShiftTiming } from '../../shifts/domain/shift.types';
import type {
  ClockRejection,
  ReviewReason,
  ShiftForClock,
  WorkMetrics,
} from './attendance.types';

const MINUTE = 60_000;
const minutes = (ms: number) => Math.floor(ms / MINUTE);

// ---------------------------------------------------------------------
// ¿A qué turno corresponde una entrada?
// ---------------------------------------------------------------------

export type ClockInSelection =
  | { shift: ShiftForClock; rejection: null }
  | { shift: ShiftForClock | null; rejection: ClockRejection; opensAt?: Date };

/**
 * Elige el turno para una entrada en el instante `at`.
 * Caso típico con dos turnos seguidos (06–14 y 14–22, anticipación 5 min):
 * a las 13:57 la ventana del segundo ya abrió mientras el primero sigue en curso;
 * se elige el primero que aún NO tenga entrada.
 */
export function selectShiftForClockIn(
  shifts: ShiftForClock[],
  at: Date,
): ClockInSelection {
  const sorted = [...shifts].sort(
    (a, b) => a.startsAt.getTime() - b.startsAt.getTime(),
  );
  const scheduled = sorted.filter((s) => s.status === 'SCHEDULED');
  const windowOpen = (s: ShiftForClock) => {
    const w = clockWindow(s);
    return at >= w.clockInOpensAt && at < w.clockInClosesAt;
  };

  const open = scheduled.filter(windowOpen);
  const available = open.find((s) => !s.attendance?.clockInAt);
  if (available) return { shift: available, rejection: null };
  if (open.length) return { shift: open[0], rejection: 'ALREADY_CLOCKED_IN' };

  const cancelled = sorted.find(
    (s) => s.status === 'CANCELLED' && windowOpen(s),
  );
  if (cancelled) return { shift: cancelled, rejection: 'SHIFT_CANCELLED' };

  const upcoming = scheduled.find((s) => at < clockWindow(s).clockInOpensAt);
  if (upcoming) {
    return {
      shift: upcoming,
      rejection: 'TOO_EARLY',
      opensAt: clockWindow(upcoming).clockInOpensAt,
    };
  }

  const missed = [...scheduled]
    .reverse()
    .find((s) => at >= s.endsAt && !s.attendance?.clockInAt);
  if (missed) return { shift: missed, rejection: 'SHIFT_ENDED' };

  return { shift: null, rejection: 'NO_SHIFT' };
}

// ---------------------------------------------------------------------
// Salida
// ---------------------------------------------------------------------

export function evaluateClockOut(
  shift: ShiftTiming,
  clockInAt: Date,
  at: Date,
): ClockRejection | null {
  if (at < clockInAt) return 'BEFORE_CLOCK_IN';
  if (at > clockWindow(shift).clockOutClosesAt)
    return 'CLOCK_OUT_WINDOW_CLOSED';
  return null;
}

// ---------------------------------------------------------------------
// Cálculo de minutos
// ---------------------------------------------------------------------

export function lateMinutesFor(shift: ShiftTiming, clockInAt: Date): number {
  return evaluateClockIn({ ...shift, status: 'SCHEDULED' }, clockInAt)
    .lateMinutes;
}

/**
 * Reglas de cálculo (minutos completos, redondeo hacia abajo):
 * - Trabajado: desde la entrada, o desde el inicio del turno si llegó antes
 *   (llegar temprano no suma), hasta la salida; menos el descanso programado.
 * - Salida anticipada: minutos entre la salida y el fin programado.
 * - Extra: minutos después del fin programado. Es tiempo BRUTO: para pagarse
 *   debe aprobarse como novedad (Incident OVERTIME) en la fase de novedades.
 */
export function computeWorkMetrics(
  shift: ShiftTiming,
  clockInAt: Date,
  clockOutAt: Date,
): WorkMetrics {
  const effectiveStart = Math.max(
    clockInAt.getTime(),
    shift.startsAt.getTime(),
  );
  const presence = minutes(clockOutAt.getTime() - effectiveStart);
  return {
    lateMinutes: lateMinutesFor(shift, clockInAt),
    earlyLeaveMinutes: Math.max(
      0,
      minutes(shift.endsAt.getTime() - clockOutAt.getTime()),
    ),
    workedMinutes: Math.max(0, presence - shift.breakMinutes),
    overtimeMinutes: Math.max(
      0,
      minutes(clockOutAt.getTime() - shift.endsAt.getTime()),
    ),
  };
}

// ---------------------------------------------------------------------
// Marcaciones sin conexión
// ---------------------------------------------------------------------

export const OFFLINE_POLICY = {
  /** Más allá de esto, la marcación offline se rechaza. */
  maxAgeHours: 48,
  /** Desfase de reloj tolerado antes de pedir revisión. */
  maxDriftSeconds: 120,
  /** Sincronizar después de este tiempo pide revisión. */
  lateSyncHours: 4,
  /** Margen para diferencias mínimas de reloj. */
  futureToleranceSeconds: 60,
} as const;

export interface OfflineTiming {
  /** Hora oficial asignada a la marcación. */
  effectiveAt: Date;
  driftSeconds: number;
  rejection: ClockRejection | null;
  reviewReasons: ReviewReason[];
}

/**
 * La hora del teléfono no es confiable, pero sí lo es la DIFERENCIA entre dos
 * lecturas del mismo reloj. Al sincronizar, el teléfono envía su hora actual
 * (`deviceNow`); comparándola con la del servidor se obtiene el desfase, y se
 * corrige cada marcación: hora oficial = hora del teléfono + desfase.
 *
 * Límite honesto: si alguien adelanta el reloj, marca y lo vuelve a poner bien
 * antes de sincronizar, el desfase medido no lo refleja. Por eso las
 * sincronizaciones tardías se marcan para revisión.
 */
export function evaluateOfflineTiming(
  clientTimestamp: Date,
  deviceNow: Date,
  serverNow: Date,
): OfflineTiming {
  const driftMs = serverNow.getTime() - deviceNow.getTime();
  const effectiveAt = new Date(clientTimestamp.getTime() + driftMs);
  const driftSeconds = Math.round(driftMs / 1000);
  const ageMs = serverNow.getTime() - effectiveAt.getTime();

  let rejection: ClockRejection | null = null;
  if (ageMs < -OFFLINE_POLICY.futureToleranceSeconds * 1000)
    rejection = 'FUTURE_TIMESTAMP';
  else if (ageMs > OFFLINE_POLICY.maxAgeHours * 3_600_000)
    rejection = 'OFFLINE_TOO_OLD';

  const reviewReasons: ReviewReason[] = [];
  if (Math.abs(driftSeconds) > OFFLINE_POLICY.maxDriftSeconds)
    reviewReasons.push('DEVICE_CLOCK_DRIFT');
  if (ageMs > OFFLINE_POLICY.lateSyncHours * 3_600_000)
    reviewReasons.push('LATE_SYNC');

  return {
    effectiveAt: rejection === 'FUTURE_TIMESTAMP' ? serverNow : effectiveAt,
    driftSeconds,
    rejection,
    reviewReasons,
  };
}
