export const ATTENDANCE_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendiente',
  IN_PROGRESS: 'En curso',
  COMPLETED: 'Completa',
  INCOMPLETE: 'Sin salida',
  ABSENT: 'Ausente',
};

export const INCIDENT_LABEL: Record<string, string> = {
  SICK_LEAVE: 'Incapacidad',
  PERMISSION: 'Permiso',
  ABSENCE: 'Ausencia justificada',
  LATE_ARRIVAL: 'Tardanza justificada',
  EARLY_DEPARTURE: 'Salida anticipada justificada',
  OVERTIME: 'Horas extra aprobadas',
  MISSED_CLOCK: 'Corrección de marcación',
  SHIFT_CHANGE: 'Cambio de turno',
  GPS_APP_ISSUE: 'Falla GPS/app',
  OTHER: 'Otra novedad',
};
