import { DomainError } from '../../../shared/domain/domain-error';

export class EmployeeNotFoundError extends DomainError {
  readonly code = 'EMPLOYEE_NOT_FOUND';
  readonly kind = 'NOT_FOUND';
  constructor() {
    super('El empleado no existe');
  }
}

export class EmployeeCodeTakenError extends DomainError {
  readonly code = 'EMPLOYEE_CODE_TAKEN';
  readonly kind = 'CONFLICT';
  constructor(code: string) {
    super(`Ya existe un empleado con el código ${code}`);
  }
}

export class EmployeeDocumentTakenError extends DomainError {
  readonly code = 'EMPLOYEE_DOCUMENT_TAKEN';
  readonly kind = 'CONFLICT';
  constructor() {
    super('Ya existe un empleado con ese documento');
  }
}

export class InvalidEmployeeDatesError extends DomainError {
  readonly code = 'INVALID_EMPLOYEE_DATES';
  readonly kind = 'VALIDATION';
}

export class InvalidStatusTransitionError extends DomainError {
  readonly code = 'INVALID_STATUS_TRANSITION';
  readonly kind = 'CONFLICT';
}

/** positionId o defaultStoreId no existen EN ESTA EMPRESA. */
export class InvalidReferenceError extends DomainError {
  readonly code = 'INVALID_REFERENCE';
  readonly kind = 'VALIDATION';
  constructor(field: string) {
    super(`El valor de ${field} no existe en la empresa`, { field });
  }
}

export class EmployeeAlreadyHasAccessError extends DomainError {
  readonly code = 'EMPLOYEE_ALREADY_HAS_ACCESS';
  readonly kind = 'CONFLICT';
  constructor() {
    super('El empleado ya tiene acceso a la app');
  }
}

export class UserAlreadyLinkedError extends DomainError {
  readonly code = 'USER_ALREADY_LINKED';
  readonly kind = 'CONFLICT';
  constructor() {
    super('Ese usuario ya está vinculado a otro empleado de la empresa');
  }
}

export class EmployeeNotActiveError extends DomainError {
  readonly code = 'EMPLOYEE_NOT_ACTIVE';
  readonly kind = 'CONFLICT';
  constructor() {
    super('No se puede dar acceso a un empleado inactivo o retirado');
  }
}

export class EmailRequiredError extends DomainError {
  readonly code = 'EMAIL_REQUIRED';
  readonly kind = 'VALIDATION';
  constructor() {
    super('El empleado no tiene correo registrado; envíe uno');
  }
}

export class PositionNotFoundError extends DomainError {
  readonly code = 'POSITION_NOT_FOUND';
  readonly kind = 'NOT_FOUND';
  constructor() {
    super('El cargo no existe');
  }
}

export class PositionNameTakenError extends DomainError {
  readonly code = 'POSITION_NAME_TAKEN';
  readonly kind = 'CONFLICT';
  constructor(name: string) {
    super(`Ya existe un cargo llamado "${name}"`);
  }
}
