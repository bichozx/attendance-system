import { DomainError } from '../../../shared/domain/domain-error';

export class NotAnEmployeeError extends DomainError {
  readonly code = 'NOT_AN_EMPLOYEE';
  readonly kind = 'FORBIDDEN';
  constructor() {
    super('Su usuario no está vinculado a un empleado en esta empresa');
  }
}

export class AttendanceNotFoundError extends DomainError {
  readonly code = 'ATTENDANCE_NOT_FOUND';
  readonly kind = 'NOT_FOUND';
  constructor() {
    super('El registro de asistencia no existe');
  }
}

export class InvalidAdjustmentError extends DomainError {
  readonly code = 'INVALID_ADJUSTMENT';
  readonly kind = 'VALIDATION';
}

/** La misma idempotencyKey ya se usó para otra marcación distinta. */
export class IdempotencyKeyReusedError extends DomainError {
  readonly code = 'IDEMPOTENCY_KEY_REUSED';
  readonly kind = 'CONFLICT';
  constructor() {
    super('Esa idempotencyKey ya se usó para una marcación diferente');
  }
}
