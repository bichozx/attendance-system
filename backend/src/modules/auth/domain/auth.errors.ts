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
