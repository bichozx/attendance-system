import { DomainError } from '../../../shared/domain/domain-error';

export class RoleNotFoundError extends DomainError {
  readonly code = 'ROLE_NOT_FOUND';
  readonly kind = 'NOT_FOUND';
  constructor() {
    super('El rol no existe');
  }
}

export class SystemRoleReadOnlyError extends DomainError {
  readonly code = 'SYSTEM_ROLE_READONLY';
  readonly kind = 'FORBIDDEN';
  constructor() {
    super('Los roles del sistema no se pueden modificar ni eliminar');
  }
}

export class RoleCodeTakenError extends DomainError {
  readonly code = 'ROLE_CODE_TAKEN';
  readonly kind = 'CONFLICT';
  constructor(code: string) {
    super(`Ya existe un rol con el código ${code}`);
  }
}

export class RoleInUseError extends DomainError {
  readonly code = 'ROLE_IN_USE';
  readonly kind = 'CONFLICT';
  constructor(members: number) {
    super('El rol está asignado a usuarios; reasígnelos antes de eliminarlo', {
      members,
    });
  }
}

export class UnknownPermissionsError extends DomainError {
  readonly code = 'UNKNOWN_PERMISSIONS';
  readonly kind = 'VALIDATION';
  constructor(unknown: string[]) {
    super('Algunos permisos no existen', { unknown });
  }
}
