import { Transform } from 'class-transformer';
import {
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../../shared/presentation/pagination-query.dto';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MSG = { message: '$property must be a date in YYYY-MM-DD format' };
const STRICT = { strict: true, strictSeparator: true };
function DateOnly() {
  return (target: object, key: string) => {
    Matches(DATE_ONLY, DATE_MSG)(target, key);
    IsISO8601(STRICT)(target, key);
  };
}

export class DashboardQueryDto {
  /** Por defecto, hoy en la zona horaria de la empresa. @example "2026-10-16" */
  @IsOptional()
  @DateOnly()
  date?: string;

  @IsOptional()
  @IsUUID()
  storeId?: string;
}

export class RangeQueryDto {
  /** @example "2026-10-01" */
  @DateOnly()
  from: string;

  /** Máximo 62 días. @example "2026-10-15" */
  @DateOnly()
  to: string;

  @IsOptional()
  @IsUUID()
  storeId?: string;
}

export class AttendanceReportQueryDto extends RangeQueryDto {
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsIn(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'INCOMPLETE', 'ABSENT'])
  status?: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'INCOMPLETE' | 'ABSENT';
}

export class ExportFormatDto {
  @IsIn(['xlsx', 'pdf'])
  format: 'xlsx' | 'pdf';
}

export class AttendanceExportQueryDto extends AttendanceReportQueryDto {
  @IsIn(['xlsx', 'pdf'])
  format: 'xlsx' | 'pdf';
}

export class TimesheetExportQueryDto extends RangeQueryDto {
  @IsIn(['xlsx', 'pdf'])
  format: 'xlsx' | 'pdf';
}

export class AuditQueryDto extends PaginationQueryDto {
  @IsOptional()
  @DateOnly()
  from?: string;

  @IsOptional()
  @DateOnly()
  to?: string;

  /** Prefijo de la acción: "employee." trae todo lo de empleados. @example "employee." */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(60)
  action?: string;

  /** @example "Employee" */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  entityType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  entityId?: string;

  @IsOptional()
  @IsUUID()
  actorUserId?: string;
}

// ---------- Respuestas ----------

export class LiveCountersDto {
  /** Personas programadas. */
  scheduled: number;
  /** Llegaron tarde (estén o no en turno). */
  late: number;
  WORKING: number;
  COMPLETED: number;
  UPCOMING: number;
  /** Pasó la tolerancia y no marcaron. */
  MISSING: number;
  /** Turno terminado sin salida. */
  PENDING_EXIT: number;
  INCOMPLETE: number;
  ABSENT: number;
  ON_TIME_OFF: number;
}

export class DashboardPersonDto {
  employeeId: string;
  employeeCode: string;
  /** @example "Carlos Pérez" */
  name: string;
  storeName: string;
  /** Inicio y fin exactos (UTC): permiten dibujar turnos nocturnos sin ambigüedad. */
  startsAt: Date;
  endsAt: Date;
  clockInAt: Date | null;
  /** @example "14:00" */
  shiftStart: string;
  shiftEnd: string;
  /** @example "MISSING" */
  status: string;
  /** @example "Sin marcar entrada" */
  statusLabel: string;
  clockIn: string | null;
  lateMinutes: number;
  /** Sin marcar: minutos desde el inicio. Salida pendiente: minutos desde el fin. */
  minutesOverdue: number | null;
}

export class StoreCountersDto {
  storeId: string;
  storeName: string;
  counters: LiveCountersDto;
}

export class AttentionDto {
  missingClockIn: DashboardPersonDto[];
  pendingExit: DashboardPersonDto[];
}

export class PendingDto {
  attendanceToReview: number;
  incidentsToApprove: number;
  shiftChangesToApprove: number;
}

export class DashboardResponseDto {
  /** @example "2026-10-16" */
  date: string;
  timeZone: string;
  serverTime: Date;
  totals: LiveCountersDto;
  byStore: StoreCountersDto[];
  attention: AttentionDto;
  pending: PendingDto;
  people: DashboardPersonDto[];
}

export class ReportColumnDto {
  key: string;
  header: string;
  /** text | minutes | number */
  type?: string;
}

export class ReportTableDto {
  title: string;
  subtitle: string;
  generatedAt: string;
  columns: ReportColumnDto[];
  /** Cada fila es un objeto { [column.key]: valor }. Los minutos vienen como número. */
  rows: Record<string, unknown>[];
  /** true si superó el máximo de filas (20.000): acote el rango o los filtros. */
  truncated: boolean;
}

export class AuditActorDto {
  id: string;
  name: string;
  email: string;
}

export class AuditItemDto {
  id: string;
  /** @example "employee.status_changed" */
  action: string;
  /** @example "Employee" */
  entityType: string;
  entityId: string;
  /** null = acción del sistema (procesos automáticos). */
  actor: AuditActorDto | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: Date;
}
