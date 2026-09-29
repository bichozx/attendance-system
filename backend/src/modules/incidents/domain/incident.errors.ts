import { DomainError } from '../../../shared/domain/domain-error';

export class IncidentNotFoundError extends DomainError {
  readonly code = 'INCIDENT_NOT_FOUND';
  readonly kind = 'NOT_FOUND';
  constructor() {
    super('La novedad no existe');
  }
}

/** Datos incoherentes con el tipo de novedad (falta el rango, sobran minutos...). */
export class InvalidIncidentError extends DomainError {
  readonly code = 'INVALID_INCIDENT';
  readonly kind = 'VALIDATION';
}

export class IncidentDuplicateError extends DomainError {
  readonly code = 'INCIDENT_DUPLICATE';
  readonly kind = 'CONFLICT';
  constructor(existingId: string) {
    super('Ya existe una novedad activa de ese tipo para esta jornada', {
      incidentId: existingId,
    });
  }
}

export class TimeOffOverlapError extends DomainError {
  readonly code = 'TIME_OFF_OVERLAP';
  readonly kind = 'CONFLICT';
  constructor(existingId: string) {
    super('Se cruza con otra incapacidad o permiso del empleado', {
      incidentId: existingId,
    });
  }
}

export class IncidentStatusError extends DomainError {
  readonly code = 'INCIDENT_STATUS';
  readonly kind = 'CONFLICT';
}

export class SelfApprovalError extends DomainError {
  readonly code = 'SELF_APPROVAL_FORBIDDEN';
  readonly kind = 'FORBIDDEN';
  constructor() {
    super('No puede aprobar ni rechazar sus propias novedades');
  }
}
