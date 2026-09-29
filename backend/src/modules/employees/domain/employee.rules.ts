import {
  InvalidEmployeeDatesError,
  InvalidStatusTransitionError,
} from './employee.errors';
import type { EmployeeStatus, StatusChange } from './employee.types';

/** Reglas puras de dominio: sin base de datos, fáciles de probar. */

export function assertEmployeeDates(dates: {
  birthDate: Date | null;
  hireDate: Date;
  terminationDate: Date | null;
}): void {
  if (dates.birthDate && dates.birthDate >= dates.hireDate) {
    throw new InvalidEmployeeDatesError(
      'La fecha de nacimiento debe ser anterior a la de ingreso',
    );
  }
  if (dates.terminationDate && dates.terminationDate < dates.hireDate) {
    throw new InvalidEmployeeDatesError(
      'La fecha de retiro no puede ser anterior a la de ingreso',
    );
  }
}

const ALLOWED_TRANSITIONS: Record<EmployeeStatus, EmployeeStatus[]> = {
  ACTIVE: ['ON_LEAVE', 'INACTIVE', 'TERMINATED'],
  ON_LEAVE: ['ACTIVE', 'INACTIVE', 'TERMINATED'],
  INACTIVE: ['ACTIVE', 'TERMINATED'],
  // Un retirado solo puede volver como reintegro (ACTIVE con nueva fecha de ingreso)
  TERMINATED: ['ACTIVE'],
};

export interface StatusChangeRequest {
  status: EmployeeStatus;
  /** Obligatoria al retirar (TERMINATED). */
  terminationDate?: Date;
  /** Obligatoria al reintegrar a alguien retirado. */
  rehireDate?: Date;
}

/**
 * Calcula el nuevo estado y fechas. Devuelve null si no hay cambio.
 * Lanza error de dominio si la transición no es válida.
 */
export function planStatusChange(
  current: {
    status: EmployeeStatus;
    hireDate: Date;
    terminationDate: Date | null;
  },
  request: StatusChangeRequest,
): StatusChange | null {
  if (current.status === request.status) return null;

  if (!ALLOWED_TRANSITIONS[current.status].includes(request.status)) {
    throw new InvalidStatusTransitionError(
      `No se puede pasar de ${current.status} a ${request.status}`,
    );
  }

  if (request.status === 'TERMINATED') {
    if (!request.terminationDate) {
      throw new InvalidEmployeeDatesError('Indique la fecha de retiro');
    }
    assertEmployeeDates({
      birthDate: null,
      hireDate: current.hireDate,
      terminationDate: request.terminationDate,
    });
    return {
      status: 'TERMINATED',
      hireDate: current.hireDate,
      terminationDate: request.terminationDate,
    };
  }

  if (current.status === 'TERMINATED') {
    if (!request.rehireDate) {
      throw new InvalidEmployeeDatesError('Indique la fecha de reingreso');
    }
    if (
      current.terminationDate &&
      request.rehireDate < current.terminationDate
    ) {
      throw new InvalidEmployeeDatesError(
        'El reingreso no puede ser anterior a la fecha de retiro',
      );
    }
    return {
      status: request.status,
      hireDate: request.rehireDate,
      terminationDate: null,
    };
  }

  return {
    status: request.status,
    hireDate: current.hireDate,
    terminationDate: null,
  };
}

/** Estados en los que la persona pierde el acceso a la app. */
export function blocksAppAccess(status: EmployeeStatus): boolean {
  return status === 'INACTIVE' || status === 'TERMINATED';
}
