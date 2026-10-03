import { Transform } from 'class-transformer';
import {
  IsIn,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MSG = { message: '$property must be a date in YYYY-MM-DD format' };
const STRICT = { strict: true, strictSeparator: true };
const TYPES = [
  'INDEFINITE',
  'FIXED_TERM',
  'WORK_OR_LABOR',
  'APPRENTICESHIP',
  'SERVICES',
] as const;

export class CreateContractDto {
  /** @example "INDEFINITE" */
  @IsIn(TYPES)
  contractType: (typeof TYPES)[number];

  /** Puede ser futura (ej. aumento desde el próximo mes). @example "2026-11-01" */
  @Matches(DATE_ONLY, DATE_MSG)
  @IsISO8601(STRICT)
  startDate: string;

  /** Obligatoria para FIXED_TERM y APPRENTICESHIP; no aplica a INDEFINITE. */
  @IsOptional()
  @Matches(DATE_ONLY, DATE_MSG)
  @IsISO8601(STRICT)
  endDate?: string | null;

  /** Texto decimal para no perder precisión. @example "2300000.00" */
  @Transform(({ value }) =>
    typeof value === 'number' ? value.toFixed(2) : value,
  )
  @Matches(/^\d{1,12}(\.\d{1,2})?$/, {
    message: 'baseSalary must be a positive amount with up to 2 decimals',
  })
  baseSalary: string;

  /** @example 42 */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(60)
  weeklyHours: number;

  /** @example "Aumento por desempeño" */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}

export class UpdateContractDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;

  /** null reabre un contrato cerrado (si no se cruza con otro). */
  @ValidateIf((_, v) => v !== undefined && v !== null)
  @Matches(DATE_ONLY, DATE_MSG)
  @IsISO8601(STRICT)
  endDate?: string | null;
}

export class ContractResponseDto {
  id: string;
  employeeId: string;
  /** @example "INDEFINITE" */
  contractType: string;
  /** @example "2026-01-15" */
  startDate: string;
  endDate: string | null;
  /** @example "2000000.00" */
  baseSalary: string;
  /** @example "COP" */
  currency: string;
  /** @example "42.00" */
  weeklyHours: string;
  notes: string | null;
  /** Vigente hoy. */
  current: boolean;
  createdAt: Date;
}

export class ClosedContractDto {
  id: string;
  endDate: string;
}

export class CreateContractResponseDto {
  contract: ContractResponseDto;
  /** Contrato anterior que se cerró automáticamente el día antes. */
  closedPrevious: ClosedContractDto | null;
  /** Ej: la jornada supera la máxima legal vigente. */
  warnings: string[];
}
