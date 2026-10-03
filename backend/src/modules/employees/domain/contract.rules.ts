import { DomainError } from '../../../shared/domain/domain-error';

export type ContractType =
  'INDEFINITE' | 'FIXED_TERM' | 'WORK_OR_LABOR' | 'APPRENTICESHIP' | 'SERVICES';

export const CONTRACT_TYPES: ContractType[] = [
  'INDEFINITE',
  'FIXED_TERM',
  'WORK_OR_LABOR',
  'APPRENTICESHIP',
  'SERVICES',
];

/** Tipos que por ley tienen fecha de terminación pactada. */
const REQUIRES_END: ContractType[] = ['FIXED_TERM', 'APPRENTICESHIP'];

export const CONTRACT_LIMITS = {
  minWeeklyHours: 1,
  maxWeeklyHours: 48,
} as const;

/** Salario como texto decimal ("2000000" o "2000000.50"): sin errores de coma flotante. */
export const SALARY_PATTERN = /^\d{1,12}(\.\d{1,2})?$/;

export interface ContractInput {
  contractType: ContractType;
  startDate: Date;
  endDate: Date | null;
  baseSalary: string;
  weeklyHours: number;
}

export interface ContractPeriod {
  id: string;
  startDate: Date;
  endDate: Date | null;
}

export class InvalidContractError extends DomainError {
  readonly code = 'INVALID_CONTRACT';
  readonly kind = 'VALIDATION';
}

export class ContractOverlapError extends DomainError {
  readonly code = 'CONTRACT_OVERLAP';
  readonly kind = 'CONFLICT';
  constructor(contractId: string) {
    super('Se cruza con otro contrato del empleado que no es el vigente', {
      contractId,
    });
  }
}

export class ContractNotFoundError extends DomainError {
  readonly code = 'CONTRACT_NOT_FOUND';
  readonly kind = 'NOT_FOUND';
  constructor() {
    super('El contrato no existe');
  }
}

const DAY = 86_400_000;

export function assertContractData(c: ContractInput, hireDate: Date): void {
  if (c.startDate < hireDate) {
    throw new InvalidContractError(
      'El contrato no puede empezar antes de la fecha de ingreso',
    );
  }
  if (c.endDate && c.endDate < c.startDate) {
    throw new InvalidContractError(
      'La fecha de fin es anterior a la de inicio',
    );
  }
  if (REQUIRES_END.includes(c.contractType) && !c.endDate) {
    throw new InvalidContractError(
      'Los contratos a término fijo y de aprendizaje requieren fecha de fin',
    );
  }
  if (!SALARY_PATTERN.test(c.baseSalary) || Number(c.baseSalary) <= 0) {
    throw new InvalidContractError(
      'El salario debe ser un valor positivo con máximo 2 decimales',
    );
  }
  if (
    !Number.isFinite(c.weeklyHours) ||
    c.weeklyHours < CONTRACT_LIMITS.minWeeklyHours ||
    c.weeklyHours > CONTRACT_LIMITS.maxWeeklyHours
  ) {
    throw new InvalidContractError(
      `Las horas semanales deben estar entre ${CONTRACT_LIMITS.minWeeklyHours} y ${CONTRACT_LIMITS.maxWeeklyHours}`,
    );
  }
}

/**
 * ¿Qué hacer con los contratos existentes al registrar uno nuevo?
 * - Si solo se cruza con el ÚLTIMO contrato y el nuevo empieza después de él, ese último
 *   se cierra el día anterior (aumento de salario, cambio de jornada, renovación).
 * - Cualquier otro cruce es un error: reescribir la historia exige corregirla a mano.
 */
export function planNewContract(
  existing: ContractPeriod[],
  input: Pick<ContractInput, 'startDate' | 'endDate'>,
): { closeId: string; closeOn: Date } | null {
  const sorted = [...existing].sort(
    (a, b) => a.startDate.getTime() - b.startDate.getTime(),
  );
  const latest = sorted.at(-1);
  const newEnd = input.endDate?.getTime() ?? Infinity;

  const overlapping = sorted.filter(
    (c) =>
      c.startDate.getTime() <= newEnd &&
      (c.endDate?.getTime() ?? Infinity) >= input.startDate.getTime(),
  );
  if (overlapping.length === 0) return null;

  const only = overlapping[0];
  if (
    overlapping.length > 1 ||
    only.id !== latest?.id ||
    only.startDate >= input.startDate
  ) {
    throw new ContractOverlapError(only.id);
  }
  return {
    closeId: only.id,
    closeOn: new Date(input.startDate.getTime() - DAY),
  };
}

/** Cambiar la fecha de fin sin pisar el contrato siguiente. */
export function assertEndDateChange(
  contract: ContractPeriod,
  all: ContractPeriod[],
  endDate: Date | null,
): void {
  if (endDate && endDate < contract.startDate) {
    throw new InvalidContractError(
      'La fecha de fin es anterior a la de inicio',
    );
  }
  const next = all
    .filter((c) => c.startDate > contract.startDate)
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())[0];
  if (next && (!endDate || endDate >= next.startDate)) {
    throw new InvalidContractError(
      'La fecha de fin debe ser anterior al inicio del contrato siguiente',
    );
  }
}

export function isCurrent(c: ContractPeriod, today: Date): boolean {
  return c.startDate <= today && (!c.endDate || c.endDate >= today);
}

/** Jornada máxima legal en Colombia desde el 15 de julio de 2026 (Ley 2101 de 2021). */
export const LEGAL_MAX_WEEKLY_HOURS = 42;

/** Avisos que no bloquean (la empresa decide), pero conviene mostrar. */
export function contractWarnings(weeklyHours: number): string[] {
  return weeklyHours > LEGAL_MAX_WEEKLY_HOURS
    ? [
        `La jornada (${weeklyHours} h) supera el máximo legal de ${LEGAL_MAX_WEEKLY_HOURS} h semanales; verifique con el área laboral.`,
      ]
    : [];
}
