import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../../shared/presentation/pagination-query.dto';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MSG = { message: '$property must be a date in YYYY-MM-DD format' };
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const STRICT = { strict: true, strictSeparator: true };

function DateOnly() {
  return (target: object, key: string) => {
    Matches(DATE_ONLY, DATE_MSG)(target, key);
    IsISO8601(STRICT)(target, key);
  };
}
function Instant() {
  return (target: object, key: string) => {
    IsISO8601(STRICT)(target, key);
    Matches(/(Z|[+-]\d{2}:\d{2})$/, {
      message: '$property must include a time zone',
    })(target, key);
  };
}

export const INCIDENT_TYPES = [
  'SICK_LEAVE',
  'PERMISSION',
  'ABSENCE',
  'LATE_ARRIVAL',
  'EARLY_DEPARTURE',
  'OVERTIME',
  'MISSED_CLOCK',
  'SHIFT_CHANGE',
  'GPS_APP_ISSUE',
  'OTHER',
] as const;
const STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;

/**
 * Campos según el tipo:
 * - SICK_LEAVE: startDate (+ endDate).
 * - PERMISSION: startDate/endDate (días) o date + startTime + endTime (horas).
 * - LATE_ARRIVAL / EARLY_DEPARTURE / OVERTIME: attendanceId (+ minutes, por defecto todo lo registrado).
 * - ABSENCE: attendanceId de una jornada ABSENT.
 * - MISSED_CLOCK: attendanceId + clockInAt y/o clockOutAt propuestos.
 * - GPS_APP_ISSUE / SHIFT_CHANGE / OTHER: attendanceId o startDate.
 */
export class RequestIncidentDto {
  /** @example "LATE_ARRIVAL" */
  @IsIn(INCIDENT_TYPES)
  type: (typeof INCIDENT_TYPES)[number];

  /** @example "Hubo un accidente en la vía y el bus se demoró" */
  @Transform(trim)
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  description: string;

  @IsOptional()
  @IsUUID()
  attendanceId?: string;

  /** @example 15 */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  minutes?: number;

  /** @example "2026-10-20" */
  @IsOptional()
  @DateOnly()
  startDate?: string;

  /** Inclusive. @example "2026-10-22" */
  @IsOptional()
  @DateOnly()
  endDate?: string;

  /** Permiso por horas. @example "2026-10-20" */
  @IsOptional()
  @DateOnly()
  date?: string;

  /** @example "08:00" */
  @IsOptional()
  @Matches(TIME, { message: 'startTime must be HH:mm' })
  startTime?: string;

  /** @example "10:30" */
  @IsOptional()
  @Matches(TIME, { message: 'endTime must be HH:mm' })
  endTime?: string;

  /** Corrección de marcación: hora real de entrada. */
  @IsOptional()
  @Instant()
  clockInAt?: string;

  /** Corrección de marcación: hora real de salida. */
  @IsOptional()
  @Instant()
  clockOutAt?: string;

  /** Enlace al soporte (ej. incapacidad escaneada). Solo https. */
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(500)
  attachmentUrl?: string;
}

export class RegisterIncidentDto extends RequestIncidentDto {
  @IsUUID()
  employeeId: string;
}

export class ApproveIncidentDto {
  /** Aprobar menos minutos de los solicitados (ej. solo 30 de 45 min extra). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  minutes?: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  notes?: string;
}

export class ResolveNotesDto {
  /** Obligatoria: el empleado la recibe en la notificación. */
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  notes: string;
}

export class ListIncidentsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @DateOnly()
  from?: string;

  @IsOptional()
  @DateOnly()
  to?: string;

  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsIn(INCIDENT_TYPES)
  type?: (typeof INCIDENT_TYPES)[number];

  /** PENDING = bandeja de aprobación. */
  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];
}

export class TimesheetQueryDto {
  /** @example "2026-10-01" */
  @DateOnly()
  from: string;

  /** Máximo 62 días. @example "2026-10-15" */
  @DateOnly()
  to: string;

  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsUUID()
  storeId?: string;
}

// ---------------------------------------------------------------------
// Respuestas
// ---------------------------------------------------------------------

export class IncidentEmployeeDto {
  id: string;
  /** @example "EMP-001" */
  code: string;
  firstName: string;
  lastName: string;
}

export class IncidentResponseDto {
  id: string;
  employee: IncidentEmployeeDto;
  /** @example "LATE_ARRIVAL" */
  type: string;
  /** @example "PENDING" */
  status: string;
  attendanceId: string | null;
  startsAt: Date;
  endsAt: Date | null;
  /** @example 15 */
  minutes: number | null;
  description: string | null;
  attachmentUrl: string | null;
  requestedById: string | null;
  reviewedById: string | null;
  reviewedAt: Date | null;
  reviewNotes: string | null;
  createdAt: Date;
}

export class AffectedShiftDto {
  shiftId: string;
  /** @example "Tienda Centro" */
  storeName: string;
  startsAt: Date;
  endsAt: Date;
  /** @example "vie, 23 de oct, 14:00–22:00" */
  description: string;
}

export class ApproveResponseDto {
  incident: IncidentResponseDto;
  /** Turnos futuros que la persona ya no cubrirá (incapacidad/permiso): reasígnelos. */
  affectedShifts: AffectedShiftDto[];
}

export class SplitDto {
  total: number;
  excused: number;
  unexcused: number;
}

export class OvertimeDto {
  /** Registrado por las marcaciones. */
  recorded: number;
  /** Aprobado: es lo que se paga. */
  approved: number;
  /** Solicitado, esperando aprobación. */
  pending: number;
  /** Registrado menos aprobado. */
  unapproved: number;
}

export class AbsencesDto {
  total: number;
  justified: number;
  unjustified: number;
}

export class TimesheetRowDto {
  employee: IncidentEmployeeDto;
  shifts: number;
  scheduledMinutes: number;
  workedMinutes: number;
  late: SplitDto;
  earlyLeave: SplitDto;
  overtime: OvertimeDto;
  absences: AbsencesDto;
  /** Jornadas sin salida aún sin resolver. */
  incomplete: number;
  pendingReview: number;
  sickLeaveDays: number;
  permissionMinutes: number;
}

export class TimesheetResponseDto {
  from: string;
  to: string;
  /** @example "America/Bogota" */
  timeZone: string;
  rows: TimesheetRowDto[];
}
