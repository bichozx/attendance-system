import {
  ConflictDetail,
  InvalidPeriodDatesError,
  InvalidShiftTimingError,
  UnavailableReason,
} from './shift.errors';
import type {
  BusySlot,
  EmployeeForScheduling,
  PeriodStatus,
  ShiftTiming,
} from './shift.types';

export const SHIFT_LIMITS = {
  minDurationMinutes: 30,
  maxDurationMinutes: 16 * 60,
  maxEarlyClockInMinutes: 120,
  maxLateToleranceMinutes: 60,
  maxPeriodDays: 31,
  /** Tiempo tras el fin del turno durante el cual aún se puede marcar salida. */
  clockOutGraceMinutes: 4 * 60,
} as const;

const MINUTE = 60_000;
const minutesBetween = (a: Date, b: Date) =>
  Math.round((b.getTime() - a.getTime()) / MINUTE);

// ---------------------------------------------------------------------
// Validaciones
// ---------------------------------------------------------------------

export function assertPeriodDates(startDate: Date, endDate: Date): void {
  if (endDate < startDate) {
    throw new InvalidPeriodDatesError(
      'La fecha final es anterior a la inicial',
    );
  }
  const days =
    Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1;
  if (days > SHIFT_LIMITS.maxPeriodDays) {
    throw new InvalidPeriodDatesError(
      `Un periodo puede tener máximo ${SHIFT_LIMITS.maxPeriodDays} días (tiene ${days})`,
    );
  }
}

export function assertShiftTiming(t: ShiftTiming): void {
  const duration = minutesBetween(t.startsAt, t.endsAt);
  if (duration < SHIFT_LIMITS.minDurationMinutes) {
    throw new InvalidShiftTimingError(
      `El turno debe durar al menos ${SHIFT_LIMITS.minDurationMinutes} minutos`,
    );
  }
  if (duration > SHIFT_LIMITS.maxDurationMinutes) {
    throw new InvalidShiftTimingError(
      `El turno no puede durar más de ${SHIFT_LIMITS.maxDurationMinutes / 60} horas`,
    );
  }
  if (t.breakMinutes >= duration) {
    throw new InvalidShiftTimingError(
      'El descanso debe ser menor que la duración del turno',
    );
  }
}

export function durationMinutes(
  t: Pick<ShiftTiming, 'startsAt' | 'endsAt'>,
): number {
  return minutesBetween(t.startsAt, t.endsAt);
}

/** Tiempo pagable programado: duración menos descanso. */
export function scheduledWorkMinutes(t: ShiftTiming): number {
  return durationMinutes(t) - t.breakMinutes;
}

// ---------------------------------------------------------------------
// Cruces de horario
// ---------------------------------------------------------------------

/** Dos franjas se cruzan si una empieza antes de que termine la otra. Tocarse (22:00 y 22:00) no es cruce. */
export function overlaps(
  a: { startsAt: Date; endsAt: Date },
  b: { startsAt: Date; endsAt: Date },
): boolean {
  return a.startsAt < b.endsAt && b.startsAt < a.endsAt;
}

export interface Candidate {
  employeeId: string;
  startsAt: Date;
  endsAt: Date;
  /** Turno que se está editando: sus asignaciones actuales no cuentan como cruce. */
  shiftId?: string;
}

/**
 * Detecta cruces de los candidatos contra lo ya programado y entre sí
 * (útil al crear turnos en lote).
 */
export function findConflicts(
  candidates: Candidate[],
  busy: BusySlot[],
): ConflictDetail[] {
  const conflicts: ConflictDetail[] = [];

  candidates.forEach((c, i) => {
    for (const slot of busy) {
      if (slot.employeeId !== c.employeeId || slot.shiftId === c.shiftId)
        continue;
      if (overlaps(c, slot)) {
        conflicts.push({
          employeeId: c.employeeId,
          conflictingShiftId: slot.shiftId,
          startsAt: c.startsAt,
          endsAt: c.endsAt,
        });
      }
    }
    for (const other of candidates.slice(i + 1)) {
      if (other.employeeId === c.employeeId && overlaps(c, other)) {
        conflicts.push({
          employeeId: c.employeeId,
          conflictingShiftId: null,
          startsAt: other.startsAt,
          endsAt: other.endsAt,
        });
      }
    }
  });
  return conflicts;
}

// ---------------------------------------------------------------------
// Disponibilidad del empleado
// ---------------------------------------------------------------------

/** Motivo por el que no se puede programar al empleado en esa fecha local, o null. */
export function unavailabilityReason(
  employee: EmployeeForScheduling,
  localDate: Date,
): UnavailableReason | null {
  if (employee.status === 'TERMINATED') return 'TERMINATED';
  if (employee.status !== 'ACTIVE') return 'NOT_ACTIVE';
  if (localDate < employee.hireDate) return 'NOT_HIRED_YET';
  if (employee.terminationDate && localDate > employee.terminationDate)
    return 'TERMINATED';
  return null;
}

// ---------------------------------------------------------------------
// Visibilidad
// ---------------------------------------------------------------------

/** Los empleados no ven turnos de periodos en borrador. Sin periodo = visible de inmediato. */
export function isVisibleToEmployees(
  periodStatus: PeriodStatus | null,
): boolean {
  return periodStatus !== 'DRAFT';
}

// ---------------------------------------------------------------------
// Ventana de marcación (la usará el módulo de asistencia)
// ---------------------------------------------------------------------

export interface ClockWindow {
  /** Desde cuándo se puede marcar entrada. Ej: turno 14:00 con 5 min → 13:55. */
  clockInOpensAt: Date;
  /** Marcar después de este instante cuenta como tardanza. */
  lateAfter: Date;
  /** Última hora para marcar entrada (el fin del turno). */
  clockInClosesAt: Date;
  /** Última hora para marcar salida. */
  clockOutClosesAt: Date;
}

export function clockWindow(t: ShiftTiming): ClockWindow {
  return {
    clockInOpensAt: new Date(
      t.startsAt.getTime() - t.earlyClockInMinutes * MINUTE,
    ),
    lateAfter: new Date(t.startsAt.getTime() + t.lateToleranceMinutes * MINUTE),
    clockInClosesAt: t.endsAt,
    clockOutClosesAt: new Date(
      t.endsAt.getTime() + SHIFT_LIMITS.clockOutGraceMinutes * MINUTE,
    ),
  };
}

export type ClockInRejection = 'SHIFT_CANCELLED' | 'TOO_EARLY' | 'SHIFT_ENDED';

export interface ClockInEvaluation {
  allowed: boolean;
  rejection: ClockInRejection | null;
  /**
   * Minutos de tardanza, contados desde la hora de inicio (no desde el fin de la tolerancia).
   * Si llega dentro de la tolerancia, es 0.
   */
  lateMinutes: number;
  window: ClockWindow;
}

export function evaluateClockIn(
  shift: ShiftTiming & { status: 'SCHEDULED' | 'CANCELLED' },
  now: Date,
): ClockInEvaluation {
  const window = clockWindow(shift);
  const result = (rejection: ClockInRejection | null, lateMinutes = 0) => ({
    allowed: rejection === null,
    rejection,
    lateMinutes,
    window,
  });

  if (shift.status === 'CANCELLED') return result('SHIFT_CANCELLED');
  if (now < window.clockInOpensAt) return result('TOO_EARLY');
  if (now >= window.clockInClosesAt) return result('SHIFT_ENDED');

  const late =
    now > window.lateAfter
      ? Math.ceil((now.getTime() - shift.startsAt.getTime()) / MINUTE)
      : 0;
  return result(null, late);
}
