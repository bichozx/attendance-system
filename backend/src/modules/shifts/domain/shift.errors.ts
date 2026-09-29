import { DomainError } from '../../../shared/domain/domain-error';

export class PeriodNotFoundError extends DomainError {
  readonly code = 'SCHEDULE_PERIOD_NOT_FOUND';
  readonly kind = 'NOT_FOUND';
  constructor() {
    super('El periodo de programación no existe');
  }
}

export class InvalidPeriodDatesError extends DomainError {
  readonly code = 'INVALID_PERIOD_DATES';
  readonly kind = 'VALIDATION';
}

export class PeriodOverlapError extends DomainError {
  readonly code = 'SCHEDULE_PERIOD_OVERLAP';
  readonly kind = 'CONFLICT';
  constructor(overlapping: { id: string; name: string }) {
    super(`Se cruza con el periodo "${overlapping.name}"`, {
      periodId: overlapping.id,
    });
  }
}

export class PeriodStatusError extends DomainError {
  readonly code = 'SCHEDULE_PERIOD_STATUS';
  readonly kind = 'CONFLICT';
}

export class ShiftNotFoundError extends DomainError {
  readonly code = 'SHIFT_NOT_FOUND';
  readonly kind = 'NOT_FOUND';
  constructor() {
    super('El turno no existe');
  }
}

export class InvalidShiftTimingError extends DomainError {
  readonly code = 'INVALID_SHIFT_TIMING';
  readonly kind = 'VALIDATION';
}

export class ShiftOutsidePeriodError extends DomainError {
  readonly code = 'SHIFT_OUTSIDE_PERIOD';
  readonly kind = 'VALIDATION';
  constructor(date: string) {
    super(`La fecha ${date} está fuera del periodo de programación`);
  }
}

export class ShiftStoreMismatchError extends DomainError {
  readonly code = 'SHIFT_STORE_MISMATCH';
  readonly kind = 'VALIDATION';
  constructor() {
    super('El periodo pertenece a otro establecimiento');
  }
}

export class StoreInactiveError extends DomainError {
  readonly code = 'STORE_INACTIVE';
  readonly kind = 'CONFLICT';
  constructor() {
    super('El establecimiento está inactivo; no se pueden programar turnos');
  }
}

/** Un turno que ya empezó no se modifica: su asistencia ya está en curso. */
export class ShiftAlreadyStartedError extends DomainError {
  readonly code = 'SHIFT_ALREADY_STARTED';
  readonly kind = 'CONFLICT';
  constructor() {
    super('El turno ya empezó o ya pasó; no se puede modificar');
  }
}

export class ShiftCancelledError extends DomainError {
  readonly code = 'SHIFT_CANCELLED';
  readonly kind = 'CONFLICT';
  constructor() {
    super('El turno está cancelado');
  }
}

export interface ConflictDetail {
  employeeId: string;
  /** Turno ya existente con el que se cruza (null si el cruce es dentro del mismo lote). */
  conflictingShiftId: string | null;
  startsAt: Date;
  endsAt: Date;
}

export class ScheduleConflictError extends DomainError {
  readonly code = 'SCHEDULE_CONFLICT';
  readonly kind = 'CONFLICT';
  constructor(conflicts: ConflictDetail[]) {
    super('Hay empleados con turnos que se cruzan', { conflicts });
  }
}

export type UnavailableReason =
  'NOT_FOUND' | 'NOT_ACTIVE' | 'NOT_HIRED_YET' | 'TERMINATED';

export class EmployeesNotAvailableError extends DomainError {
  readonly code = 'EMPLOYEES_NOT_AVAILABLE';
  readonly kind = 'CONFLICT';
  constructor(
    unavailable: { employeeId: string; reason: UnavailableReason }[],
  ) {
    super('Algunos empleados no se pueden programar', { unavailable });
  }
}

export class AssignmentNotFoundError extends DomainError {
  readonly code = 'ASSIGNMENT_NOT_FOUND';
  readonly kind = 'NOT_FOUND';
  constructor() {
    super('El empleado no está asignado a este turno');
  }
}
