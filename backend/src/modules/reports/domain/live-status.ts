/** Estado en vivo de cada persona programada (lo que ve el supervisor en el dashboard). */
export type LiveStatus =
  | 'ON_TIME_OFF' // incapacidad o permiso aprobado: justificado
  | 'UPCOMING' // aún dentro de la tolerancia, sin marcar
  | 'MISSING' // pasó la tolerancia y no ha marcado entrada
  | 'WORKING' // en turno
  | 'PENDING_EXIT' // el turno terminó y no marcó salida
  | 'COMPLETED'
  | 'INCOMPLETE' // cerrada sin salida (proceso automático)
  | 'ABSENT';

export interface LiveInput {
  startsAt: Date;
  endsAt: Date;
  lateToleranceMinutes: number;
  attendance: {
    status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'INCOMPLETE' | 'ABSENT';
    clockInAt: Date | null;
    lateMinutes: number;
  } | null;
  /** Hay incapacidad/permiso aprobado que se cruza con el turno. */
  onTimeOff: boolean;
}

export function liveStatus(i: LiveInput, now: Date): LiveStatus {
  const a = i.attendance;
  if (a?.status === 'COMPLETED') return 'COMPLETED';
  if (a?.status === 'INCOMPLETE') return 'INCOMPLETE';
  if (a?.status === 'IN_PROGRESS')
    return now >= i.endsAt ? 'PENDING_EXIT' : 'WORKING';
  // Sin entrada
  if (i.onTimeOff) return 'ON_TIME_OFF';
  if (a?.status === 'ABSENT' || now >= i.endsAt) return 'ABSENT';
  const lateAfter = i.startsAt.getTime() + i.lateToleranceMinutes * 60_000;
  return now.getTime() > lateAfter ? 'MISSING' : 'UPCOMING';
}

export const LIVE_STATUS_LABEL: Record<LiveStatus, string> = {
  ON_TIME_OFF: 'Incapacidad/permiso',
  UPCOMING: 'Por llegar',
  MISSING: 'Sin marcar entrada',
  WORKING: 'En turno',
  PENDING_EXIT: 'Salida pendiente',
  COMPLETED: 'Completó',
  INCOMPLETE: 'Sin salida',
  ABSENT: 'Ausente',
};

export type LiveCounters = Record<LiveStatus, number> & {
  scheduled: number;
  late: number;
};

export function emptyCounters(): LiveCounters {
  return {
    scheduled: 0,
    late: 0,
    ON_TIME_OFF: 0,
    UPCOMING: 0,
    MISSING: 0,
    WORKING: 0,
    PENDING_EXIT: 0,
    COMPLETED: 0,
    INCOMPLETE: 0,
    ABSENT: 0,
  };
}

/** Suma una persona a los contadores. "late" es transversal: llegó tarde (esté o no en turno). */
export function count(
  counters: LiveCounters,
  status: LiveStatus,
  lateMinutes: number,
): void {
  counters.scheduled++;
  counters[status]++;
  if (lateMinutes > 0) counters.late++;
}
