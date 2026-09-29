import { DomainError } from '../../../shared/domain/domain-error';

export class StoreNotFoundError extends DomainError {
  readonly code = 'STORE_NOT_FOUND';
  readonly kind = 'NOT_FOUND';
  constructor() {
    super('El establecimiento no existe');
  }
}

export class StoreCodeTakenError extends DomainError {
  readonly code = 'STORE_CODE_TAKEN';
  readonly kind = 'CONFLICT';
  constructor(code: string) {
    super(`Ya existe un establecimiento con el código ${code}`);
  }
}

export class InvalidTimeZoneError extends DomainError {
  readonly code = 'INVALID_TIMEZONE';
  readonly kind = 'VALIDATION';
  constructor(timeZone: string) {
    super(`"${timeZone}" no es una zona horaria válida (ej: America/Bogota)`);
  }
}

export class GeofenceNotFoundError extends DomainError {
  readonly code = 'GEOFENCE_NOT_FOUND';
  readonly kind = 'NOT_FOUND';
  constructor() {
    super('La geocerca no existe');
  }
}

export class IncompleteCoordinatesError extends DomainError {
  readonly code = 'INCOMPLETE_COORDINATES';
  readonly kind = 'VALIDATION';
  constructor() {
    super('Envíe latitud y longitud juntas');
  }
}

/** Protege contra errores de digitación, como latitud y longitud invertidas. */
export class GeofenceTooFarError extends DomainError {
  readonly code = 'GEOFENCE_TOO_FAR';
  readonly kind = 'VALIDATION';
  constructor(distanceMeters: number, maxMeters: number) {
    super(
      `El centro de la geocerca está a ${Math.round(distanceMeters)} m del establecimiento ` +
        `(máximo ${maxMeters} m). ¿Invirtió latitud y longitud?`,
      { distanceMeters: Math.round(distanceMeters), maxMeters },
    );
  }
}

export class LastActiveGeofenceError extends DomainError {
  readonly code = 'LAST_ACTIVE_GEOFENCE';
  readonly kind = 'CONFLICT';
  constructor() {
    super(
      'Es la única geocerca activa del establecimiento; sin ella nadie podría marcar asistencia. ' +
        'Cree otra antes, o desactive el establecimiento.',
    );
  }
}

export class GeofenceInUseError extends DomainError {
  readonly code = 'GEOFENCE_IN_USE';
  readonly kind = 'CONFLICT';
  constructor() {
    super(
      'La geocerca tiene marcaciones registradas y no se puede eliminar; desactívela en su lugar',
    );
  }
}
