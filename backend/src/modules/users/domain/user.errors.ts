import { DomainError } from '../../../shared/domain/domain-error';

export class CompanyUserNotFoundError extends DomainError {
  readonly code = 'USER_NOT_FOUND';
  readonly kind = 'NOT_FOUND';
  constructor() {
    super('El usuario no existe en esta empresa');
  }
}

export class UserAlreadyMemberError extends DomainError {
  readonly code = 'USER_ALREADY_MEMBER';
  readonly kind = 'CONFLICT';
  constructor() {
    super('El usuario ya pertenece a esta empresa');
  }
}

export class PasswordRequiredError extends DomainError {
  readonly code = 'PASSWORD_REQUIRED';
  readonly kind = 'VALIDATION';
  constructor() {
    super('Se requiere una contraseña inicial para crear la cuenta');
  }
}

/** Evita que un admin se quite su propio acceso o permisos por error. */
export class CannotModifySelfError extends DomainError {
  readonly code = 'CANNOT_MODIFY_SELF';
  readonly kind = 'FORBIDDEN';
  constructor() {
    super('No puede cambiar su propio rol ni su propio estado');
  }
}
