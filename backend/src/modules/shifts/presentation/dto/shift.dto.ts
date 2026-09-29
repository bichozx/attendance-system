import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../../shared/presentation/pagination-query.dto';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const IfPresent = () => ValidateIf((_, v) => v !== undefined);

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MSG = { message: '$property must be a date in YYYY-MM-DD format' };
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const TIME_MSG = {
  message: '$property must be a time in HH:mm format (00:00-23:59)',
};
const STRICT = { strict: true, strictSeparator: true };

function DateOnly() {
  return (target: object, key: string) => {
    Matches(DATE_ONLY, DATE_MSG)(target, key);
    IsISO8601(STRICT)(target, key);
  };
}

// ---------------------------------------------------------------------
// Periodos
// ---------------------------------------------------------------------

export class ListPeriodsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED', 'CLOSED'])
  status?: 'DRAFT' | 'PUBLISHED' | 'CLOSED';

  /** Incluye los periodos de toda la empresa. */
  @IsOptional()
  @IsUUID()
  storeId?: string;
}

export class CreatePeriodDto {
  /** Omitir para un periodo que aplica a todos los establecimientos. */
  @IsOptional()
  @IsUUID()
  storeId?: string | null;

  /**
   * Si se omite se genera, ej: "Quincena 16–31 oct 2026".
   * @example "Quincena 16–31 oct 2026"
   */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  /** @example "2026-10-16" */
  @DateOnly()
  startDate: string;

  /** @example "2026-10-31" */
  @DateOnly()
  endDate: string;
}

export class UpdatePeriodDto {
  @IfPresent()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  /** Solo en borradores sin turnos. */
  @IfPresent()
  @DateOnly()
  startDate?: string;

  @IfPresent()
  @DateOnly()
  endDate?: string;
}

// ---------------------------------------------------------------------
// Turnos
// ---------------------------------------------------------------------

/** Horario en hora LOCAL del establecimiento. */
export class ShiftTimeDto {
  /** @example "2026-10-16" */
  @DateOnly()
  date: string;

  /** @example "14:00" */
  @Matches(TIME, TIME_MSG)
  startTime: string;

  /**
   * Si es menor o igual que startTime, el turno termina al día siguiente (turno nocturno).
   * @example "22:00"
   */
  @Matches(TIME, TIME_MSG)
  endTime: string;

  /** @example 60 */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(240)
  breakMinutes?: number;

  /**
   * Minutos antes del inicio desde los que se puede marcar. Por defecto 5.
   * @example 5
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  earlyClockInMinutes?: number;

  /**
   * Minutos de gracia antes de contar tardanza. Por defecto 0.
   * @example 5
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60)
  lateToleranceMinutes?: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  notes?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  employeeIds?: string[];
}

export class CreateShiftDto extends ShiftTimeDto {
  @IsUUID()
  storeId: string;

  /** Opcional: un turno sin periodo es visible para el empleado de inmediato. */
  @IsOptional()
  @IsUUID()
  schedulePeriodId?: string | null;
}

export class BulkCreateShiftsDto {
  @IsUUID()
  storeId: string;

  @IsOptional()
  @IsUUID()
  schedulePeriodId?: string | null;

  /** Hasta 300 turnos. Si alguno falla, no se crea ninguno. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => ShiftTimeDto)
  shifts: ShiftTimeDto[];
}

export class UpdateShiftDto {
  @IfPresent()
  @DateOnly()
  date?: string;

  @IfPresent()
  @Matches(TIME, TIME_MSG)
  startTime?: string;

  @IfPresent()
  @Matches(TIME, TIME_MSG)
  endTime?: string;

  @IfPresent()
  @IsInt()
  @Min(0)
  @Max(240)
  breakMinutes?: number;

  @IfPresent()
  @IsInt()
  @Min(0)
  @Max(120)
  earlyClockInMinutes?: number;

  @IfPresent()
  @IsInt()
  @Min(0)
  @Max(60)
  lateToleranceMinutes?: number;

  /** null para borrarlas. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}

export class CancelShiftDto {
  /** Se incluye en la notificación al empleado. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class AssignEmployeesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  employeeIds: string[];
}

export class UnassignQueryDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class DateRangeQueryDto {
  /**
   * Fecha local inicial (zona horaria de la empresa).
   * @example "2026-10-16"
   */
  @DateOnly()
  from: string;

  /**
   * Fecha local final, inclusive. Máximo 62 días de rango.
   * @example "2026-10-31"
   */
  @DateOnly()
  to: string;
}

export class ListShiftsQueryDto extends DateRangeQueryDto {
  @IsOptional()
  @IsUUID()
  storeId?: string;

  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsUUID()
  schedulePeriodId?: string;

  @IsOptional()
  @IsIn(['SCHEDULED', 'CANCELLED'])
  status?: 'SCHEDULED' | 'CANCELLED';
}

// ---------------------------------------------------------------------
// Respuestas
// ---------------------------------------------------------------------

export class PeriodResponseDto {
  id: string;
  storeId: string | null;
  storeName: string | null;
  /** @example "Quincena 16–31 oct 2026" */
  name: string;
  /** @example "2026-10-16" */
  startDate: string;
  /** @example "2026-10-31" */
  endDate: string;
  /** @example "DRAFT" */
  status: string;
  publishedAt: Date | null;
  /** Turnos activos (no cancelados). */
  shiftCount: number;
  createdAt: Date;
}

export class LocalTimeDto {
  /** @example "2026-10-16" */
  date: string;
  /** @example "14:00" */
  startTime: string;
  /** @example "22:00" */
  endTime: string;
  /** true si termina al día siguiente. */
  overnight: boolean;
}

export class ClockWindowDto {
  /** Desde cuándo se puede marcar entrada. */
  clockInOpensAt: Date;
  /** Marcar después cuenta como tardanza. */
  lateAfter: Date;
  clockInClosesAt: Date;
  clockOutClosesAt: Date;
}

export class AssignmentResponseDto {
  id: string;
  employeeId: string;
  /** @example "EMP-001" */
  employeeCode: string;
  firstName: string;
  lastName: string;
  /** @example "ASSIGNED" */
  status: string;
}

export class ShiftResponseDto {
  id: string;
  storeId: string;
  /** @example "Tienda Centro" */
  storeName: string;
  /** @example "America/Bogota" */
  timeZone: string;
  schedulePeriodId: string | null;
  /** null = turno sin periodo. */
  periodStatus: string | null;
  /** @example "SCHEDULED" */
  status: string;
  notes: string | null;
  /** Instante UTC. */
  startsAt: Date;
  endsAt: Date;
  /** El mismo horario en hora local del establecimiento. */
  local: LocalTimeDto;
  /** @example 480 */
  durationMinutes: number;
  /** Duración menos descanso. @example 420 */
  scheduledWorkMinutes: number;
  breakMinutes: number;
  earlyClockInMinutes: number;
  lateToleranceMinutes: number;
  clockWindow: ClockWindowDto;
  assignments: AssignmentResponseDto[];
  createdAt: Date;
  updatedAt: Date;
}

export class BulkCreateResponseDto {
  /** @example 12 */
  created: number;
  shiftIds: string[];
}

export class MyShiftResponseDto {
  id: string;
  storeId: string;
  storeName: string;
  timeZone: string;
  /** SCHEDULED o CANCELLED. */
  status: string;
  /** ASSIGNED, o CANCELLED si lo retiraron del turno. */
  myAssignmentStatus: string;
  notes: string | null;
  startsAt: Date;
  endsAt: Date;
  local: LocalTimeDto;
  scheduledWorkMinutes: number;
  breakMinutes: number;
  clockWindow: ClockWindowDto;
}

export class MyShiftsResponseDto {
  /** null si el usuario no está vinculado a un empleado en esta empresa. */
  employeeId: string | null;
  shifts: MyShiftResponseDto[];
}
