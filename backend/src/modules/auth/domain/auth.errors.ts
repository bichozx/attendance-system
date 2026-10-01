import { DomainError } from '../../../shared/domain/domain-error';

export class InvalidCredentialsError extends DomainError {
  readonly code = 'INVALID_CREDENTIALS';
  readonly kind = 'UNAUTHORIZED';
  constructor() {
    super('Correo o contraseña incorrectos');
  }
}

export class UserNotActiveError extends DomainError {
  readonly code = 'USER_NOT_ACTIVE';
  readonly kind = 'FORBIDDEN';
  constructor() {
    super('El usuario está inactivo o bloqueado');
  }
}

export class NoActiveCompanyError extends DomainError {
  readonly code = 'NO_ACTIVE_COMPANY';
  readonly kind = 'FORBIDDEN';
  constructor() {
    super('El usuario no pertenece a ninguna empresa activa');
  }
}

export class CompanyAccessDeniedError extends DomainError {
  readonly code = 'COMPANY_ACCESS_DENIED';
  readonly kind = 'FORBIDDEN';
  constructor() {
    super('El usuario no tiene acceso a la empresa indicada');
  }
}

export interface CompanyOption {
  id: string;
  name: string;
  slug: string;
}

/** El usuario pertenece a varias empresas y debe elegir una (reintentar login con companyId). */
export class CompanySelectionRequiredError extends DomainError {
  readonly code = 'COMPANY_SELECTION_REQUIRED';
  readonly kind = 'CONFLICT';
  constructor(companies: CompanyOption[]) {
    super('Seleccione la empresa con la que desea ingresar', { companies });
  }
}

export class InvalidRefreshTokenError extends DomainError {
  readonly code = 'INVALID_REFRESH_TOKEN';
  readonly kind = 'UNAUTHORIZED';
  constructor() {
    super('La sesión no es válida o expiró');
  }
}

/** Se presentó un refresh token ya rotado: posible robo. La sesión se revoca. */
export class RefreshTokenReusedError extends DomainError {
  readonly code = 'REFRESH_TOKEN_REUSED';
  readonly kind = 'UNAUTHORIZED';
  constructor() {
    super('La sesión fue cerrada por seguridad. Inicie sesión de nuevo');
  }
}

export class AccountLockedError extends DomainError {
  readonly code = 'ACCOUNT_LOCKED';
  readonly kind = 'FORBIDDEN';
  constructor(retryAfterSeconds: number) {
    super(
      `Cuenta bloqueada temporalmente por intentos fallidos. Intente de nuevo en ${Math.ceil(retryAfterSeconds / 60)} min o restablezca su contraseña.`,
      { retryAfterSeconds },
    );
  }
}

/** 400 y no 401: un 401 haría que el cliente intente renovar el token sin sentido. */
export class InvalidCurrentPasswordError extends DomainError {
  readonly code = 'INVALID_CURRENT_PASSWORD';
  readonly kind = 'VALIDATION';
  constructor() {
    super('La contraseña actual no es correcta');
  }
}

export class PasswordUnchangedError extends DomainError {
  readonly code = 'PASSWORD_UNCHANGED';
  readonly kind = 'VALIDATION';
  constructor() {
    super('La nueva contraseña debe ser diferente de la actual');
  }
}

export class InvalidResetTokenError extends DomainError {
  readonly code = 'INVALID_RESET_TOKEN';
  readonly kind = 'VALIDATION';
  constructor() {
    super('El enlace no es válido o ya expiró. Solicite uno nuevo.');
  }
}

/** La cuenta tiene una contraseña temporal: debe cambiarla antes de usar la API. */
export class PasswordChangeRequiredError extends DomainError {
  readonly code = 'PASSWORD_CHANGE_REQUIRED';
  readonly kind = 'FORBIDDEN';
  constructor() {
    super('Debe cambiar su contraseña temporal antes de continuar');
  }
}

export class SessionNotFoundError extends DomainError {
  readonly code = 'SESSION_NOT_FOUND';
  readonly kind = 'NOT_FOUND';
  constructor() {
    super('La sesión no existe o ya fue cerrada');
  }
}
