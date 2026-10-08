export type LiveStatus =
  | 'WORKING'
  | 'MISSING'
  | 'PENDING_EXIT'
  | 'UPCOMING'
  | 'COMPLETED'
  | 'INCOMPLETE'
  | 'ABSENT'
  | 'ON_TIME_OFF';

/** Orden de la leyenda: primero lo que pide acción. */
export const STATUS_ORDER: LiveStatus[] = ['MISSING', 'PENDING_EXIT', 'WORKING', 'UPCOMING', 'COMPLETED', 'ON_TIME_OFF', 'INCOMPLETE', 'ABSENT'];

export const STATUS: Record<LiveStatus, { label: string; bar: string; dot: string }> = {
  MISSING: { label: 'Sin marcar entrada', bar: 'bg-missing', dot: 'bg-missing' },
  PENDING_EXIT: { label: 'Salida pendiente', bar: 'bg-warn', dot: 'bg-warn' },
  WORKING: { label: 'En turno', bar: 'bg-working', dot: 'bg-working' },
  UPCOMING: { label: 'Por llegar', bar: 'border-2 border-dashed border-upcoming bg-transparent', dot: 'border-2 border-upcoming' },
  COMPLETED: { label: 'Completó', bar: 'bg-done/70', dot: 'bg-done/70' },
  ON_TIME_OFF: { label: 'Incapacidad o permiso', bar: 'bg-leave/80', dot: 'bg-leave' },
  INCOMPLETE: { label: 'Sin salida', bar: 'bg-warn/60', dot: 'bg-warn/60' },
  ABSENT: { label: 'Ausente', bar: 'bg-missing/35', dot: 'bg-missing/35' },
};
