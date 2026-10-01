import { DomainError } from '../../../shared/domain/domain-error';

export class CompanyNotFoundError extends DomainError {
  readonly code = 'COMPANY_NOT_FOUND';
  readonly kind = 'NOT_FOUND';
  constructor() {
    super('La empresa no existe');
  }
}

export class CompanySlugTakenError extends DomainError {
  readonly code = 'COMPANY_SLUG_TAKEN';
  readonly kind = 'CONFLICT';
  constructor(slug: string) {
    super(`El identificador "${slug}" ya está en uso`);
  }
}

export class CompanyTaxIdTakenError extends DomainError {
  readonly code = 'COMPANY_TAX_ID_TAKEN';
  readonly kind = 'CONFLICT';
  constructor() {
    super('Ya existe una empresa con ese NIT en el país');
  }
}

export class InvalidCompanySettingsError extends DomainError {
  readonly code = 'INVALID_COMPANY_SETTINGS';
  readonly kind = 'VALIDATION';
}

export class CompanyAdminNotFoundError extends DomainError {
  readonly code = 'COMPANY_ADMIN_NOT_FOUND';
  readonly kind = 'NOT_FOUND';
  constructor() {
    super('Esa persona no es administradora de la empresa');
  }
}
