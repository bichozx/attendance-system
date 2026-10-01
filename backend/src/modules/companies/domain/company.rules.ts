import { isValidTimeZone } from '../../../shared/domain/geo';
import { InvalidCompanySettingsError } from './company.errors';
import type {
  CompanyLegalChanges,
  CompanyStatus,
  ShiftDefaults,
} from './company.types';

export const SHIFT_DEFAULT_LIMITS = {
  earlyClockInMinutes: { min: 0, max: 120 },
  lateToleranceMinutes: { min: 0, max: 60 },
  breakMinutes: { min: 0, max: 240 },
} as const;

/** Estados en los que la empresa puede operar (sus usuarios pueden entrar). */
export const OPERATING_STATUSES: CompanyStatus[] = ['TRIAL', 'ACTIVE'];

export function blocksAccess(status: CompanyStatus): boolean {
  return !OPERATING_STATUSES.includes(status);
}

/** "Panadería Doña Rosa S.A.S." → "panaderia-dona-rosa-s-a-s" */
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // tildes
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/g, '');
}

export function assertCompanySettings(changes: CompanyLegalChanges): void {
  if (changes.timezone !== undefined && !isValidTimeZone(changes.timezone)) {
    throw new InvalidCompanySettingsError(
      `"${changes.timezone}" no es una zona horaria válida (ej: America/Bogota)`,
    );
  }
  if (changes.country !== undefined && !/^[A-Z]{2}$/.test(changes.country)) {
    throw new InvalidCompanySettingsError(
      'El país debe ser un código ISO de 2 letras (ej: CO)',
    );
  }
  if (changes.currency !== undefined && !/^[A-Z]{3}$/.test(changes.currency)) {
    throw new InvalidCompanySettingsError(
      'La moneda debe ser un código ISO de 3 letras (ej: COP)',
    );
  }
  if (
    changes.slug !== undefined &&
    (changes.slug !== slugify(changes.slug) || !changes.slug)
  ) {
    throw new InvalidCompanySettingsError(
      'El identificador solo admite minúsculas, números y guiones (ej: panaderia-rosa)',
    );
  }
  for (const [key, value] of Object.entries(changes.shiftDefaults ?? {})) {
    const limits = SHIFT_DEFAULT_LIMITS[key as keyof ShiftDefaults];
    if (!limits || value === undefined) continue;
    if (!Number.isInteger(value) || value < limits.min || value > limits.max) {
      throw new InvalidCompanySettingsError(
        `${key} debe estar entre ${limits.min} y ${limits.max} minutos`,
      );
    }
  }
}
