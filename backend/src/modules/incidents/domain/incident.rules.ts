import { IncidentStatusError, InvalidIncidentError } from './incident.errors';
import type {
  AttendanceForIncident,
  IncidentStatus,
  IncidentType,
} from './incident.types';

/**
 * Qué exige cada tipo:
 * - range: cubre un periodo propio (incapacidad, permiso).
 * - attendance: se ata a una jornada registrada.
 * - minutesFrom: de qué métrica sale el máximo de minutos justificables.
 */
export const INCIDENT_RULES: Record<
  IncidentType,
  {
    range: boolean;
    attendance: 'required' | 'optional' | 'none';
    minutesFrom?: 'lateMinutes' | 'earlyLeaveMinutes' | 'overtimeMinutes';
    /** Estados de la asistencia en los que tiene sentido. */
    attendanceStatuses?: AttendanceForIncident['status'][];
  }
> = {
  SICK_LEAVE: { range: true, attendance: 'none' },
  PERMISSION: { range: true, attendance: 'none' },
  ABSENCE: {
    range: false,
    attendance: 'required',
    attendanceStatuses: ['ABSENT'],
  },
  LATE_ARRIVAL: {
    range: false,
    attendance: 'required',
    minutesFrom: 'lateMinutes',
  },
  EARLY_DEPARTURE: {
    range: false,
    attendance: 'required',
    minutesFrom: 'earlyLeaveMinutes',
  },
  OVERTIME: {
    range: false,
    attendance: 'required',
    minutesFrom: 'overtimeMinutes',
  },
  MISSED_CLOCK: {
    range: false,
    attendance: 'required',
    attendanceStatuses: ['ABSENT', 'INCOMPLETE', 'IN_PROGRESS'],
  },
  GPS_APP_ISSUE: { range: false, attendance: 'optional' },
  SHIFT_CHANGE: { range: false, attendance: 'optional' },
  OTHER: { range: false, attendance: 'optional' },
};

export const TIME_OFF_TYPES: IncidentType[] = ['SICK_LEAVE', 'PERMISSION'];
export const MAX_TIME_OFF_DAYS = 180;
/** Hasta cuántos días atrás un empleado puede reportar algo. */
export const MAX_REQUEST_AGE_DAYS = 60;

/**
 * Minutos a justificar: por defecto todos los registrados; nunca más de lo registrado.
 * Devuelve null en los tipos que no usan minutos.
 */
export function resolveMinutes(
  type: IncidentType,
  attendance: AttendanceForIncident | null,
  requested: number | undefined,
): number | null {
  const metric = INCIDENT_RULES[type].minutesFrom;
  if (!metric) {
    if (requested !== undefined) {
      throw new InvalidIncidentError('Este tipo de novedad no lleva minutos');
    }
    return null;
  }
  const recorded = attendance![metric];
  if (recorded <= 0) {
    throw new InvalidIncidentError(
      'La jornada no registra minutos para justificar en este concepto',
    );
  }
  const minutes = requested ?? recorded;
  if (minutes > recorded) {
    throw new InvalidIncidentError(
      `Solo se pueden justificar hasta ${recorded} minutos registrados`,
    );
  }
  return minutes;
}

export function assertAttendanceFits(
  type: IncidentType,
  attendance: AttendanceForIncident,
) {
  const allowed = INCIDENT_RULES[type].attendanceStatuses;
  if (allowed && !allowed.includes(attendance.status)) {
    throw new InvalidIncidentError(
      `Una novedad ${type} no aplica a una jornada en estado ${attendance.status}`,
    );
  }
}

/** Horas propuestas para un olvido de marcación: completa lo que falte con lo registrado. */
export function resolveMissedClock(
  attendance: AttendanceForIncident,
  proposed: { clockInAt?: Date; clockOutAt?: Date },
): { startsAt: Date; endsAt: Date } {
  const clockIn = proposed.clockInAt ?? attendance.clockInAt;
  const clockOut = proposed.clockOutAt ?? attendance.clockOutAt;
  if (!clockIn || !clockOut) {
    throw new InvalidIncidentError(
      'Indique la hora de entrada y/o salida que faltó registrar',
    );
  }
  if (clockOut <= clockIn) {
    throw new InvalidIncidentError('La salida debe ser posterior a la entrada');
  }
  if (!proposed.clockInAt && !proposed.clockOutAt) {
    throw new InvalidIncidentError('No propuso ninguna hora para corregir');
  }
  return { startsAt: clockIn, endsAt: clockOut };
}

// ---------------------------------------------------------------------
// Transiciones de estado
// ---------------------------------------------------------------------

export type IncidentAction = 'APPROVE' | 'REJECT' | 'CANCEL_OWN' | 'REVOKE';

const TRANSITIONS: Record<
  IncidentAction,
  { from: IncidentStatus[]; to: IncidentStatus }
> = {
  APPROVE: { from: ['PENDING'], to: 'APPROVED' },
  REJECT: { from: ['PENDING'], to: 'REJECTED' },
  CANCEL_OWN: { from: ['PENDING'], to: 'CANCELLED' },
  // El supervisor puede anular una aprobada (ej. incapacidad registrada por error)
  REVOKE: { from: ['APPROVED'], to: 'CANCELLED' },
};

const ACTION_LABEL: Record<IncidentAction, string> = {
  APPROVE: 'aprobar',
  REJECT: 'rechazar',
  CANCEL_OWN: 'cancelar',
  REVOKE: 'anular',
};

export function nextStatus(
  current: IncidentStatus,
  action: IncidentAction,
): IncidentStatus {
  const t = TRANSITIONS[action];
  if (!t.from.includes(current)) {
    throw new IncidentStatusError(
      `No se puede ${ACTION_LABEL[action]} una novedad en estado ${current}`,
    );
  }
  return t.to;
}
