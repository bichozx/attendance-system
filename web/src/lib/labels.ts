export const INCIDENT_LABEL: Record<string, string> = {
  SICK_LEAVE: 'Incapacidad',
  PERMISSION: 'Permiso',
  ABSENCE: 'Justificación de ausencia',
  LATE_ARRIVAL: 'Justificación de tardanza',
  EARLY_DEPARTURE: 'Justificación de salida anticipada',
  OVERTIME: 'Horas extra',
  MISSED_CLOCK: 'Olvido de marcación',
  SHIFT_CHANGE: 'Cambio de turno',
  GPS_APP_ISSUE: 'Falla del GPS o la app',
  OTHER: 'Otra novedad',
};

/** Por qué una marcación quedó para revisión (en palabras del supervisor). */
export const REVIEW_REASON: Record<string, string> = {
  DEVICE_CLOCK_DRIFT: 'El reloj del teléfono estaba desfasado',
  LATE_SYNC: 'Se envió horas después (sin señal)',
  OFFLINE_TOO_OLD: 'Marcación sin conexión muy antigua',
  FUTURE_TIMESTAMP: 'Hora del teléfono en el futuro',
  MISSING_CLOCK_OUT: 'Sin salida',
  AUTO_CLOSED: 'Cerrada automáticamente',
};

export const ATTENDANCE_STATUS: Record<string, string> = {
  PENDING: 'Pendiente',
  IN_PROGRESS: 'En turno',
  COMPLETED: 'Completa',
  INCOMPLETE: 'Sin salida',
  ABSENT: 'Ausente',
};

export const EMPLOYEE_STATUS: Record<string, { label: string; tone: 'working' | 'warn' | 'done' | 'missing' }> = {
  ACTIVE: { label: 'Activo', tone: 'working' },
  ON_LEAVE: { label: 'En licencia', tone: 'warn' },
  INACTIVE: { label: 'Inactivo', tone: 'done' },
  TERMINATED: { label: 'Retirado', tone: 'missing' },
};

export const DOCUMENT_TYPES = [
  ['CC', 'Cédula de ciudadanía'],
  ['CE', 'Cédula de extranjería'],
  ['TI', 'Tarjeta de identidad'],
  ['PPT', 'Permiso por protección temporal'],
  ['PASSPORT', 'Pasaporte'],
  ['OTHER', 'Otro'],
] as const;

export const CONTRACT_TYPES = [
  ['INDEFINITE', 'Término indefinido'],
  ['FIXED_TERM', 'Término fijo'],
  ['WORK_OR_LABOR', 'Obra o labor'],
  ['APPRENTICESHIP', 'Aprendizaje'],
  ['SERVICES', 'Prestación de servicios'],
] as const;

export const contractLabel = (type: string) => CONTRACT_TYPES.find(([k]) => k === type)?.[1] ?? type;

/** "2300000.00" → "$ 2.300.000" */
export function money(value: string, currency = 'COP') {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency, maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(Number(value));
}
