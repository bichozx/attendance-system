import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsNumber,
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
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MSG = { message: '$property must be a date in YYYY-MM-DD format' };
const STRICT = { strict: true, strictSeparator: true };

/** Instante ISO 8601 con zona, ej: "2026-10-16T19:02:11.000Z". */
function Instant() {
  return (target: object, key: string) => {
    IsISO8601(STRICT)(target, key);
    Matches(/(Z|[+-]\d{2}:\d{2})$/, {
      message: '$property must include a time zone (Z or ±hh:mm)',
    })(target, key);
  };
}

export class DeviceInfoDto {
  /** @example "android" */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  platform?: string;

  /** @example "14" */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  osVersion?: string;

  /** @example "Samsung A54" */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  model?: string;

  /** @example "1.0.3" */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  appVersion?: string;
}

class LocationFields {
  /** @example 4.6097 */
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-90)
  @Max(90)
  latitude: number;

  /** @example -74.0817 */
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  longitude: number;

  /** @example 12 */
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(100_000)
  accuracyMeters: number;

  /** true si el sistema operativo indica ubicación simulada (se rechaza). */
  @IsOptional()
  @IsBoolean()
  mocked?: boolean;

  /**
   * UUID generado por la app para esta marcación. Si la red falla y la app
   * reintenta con la misma clave, no se duplica: se devuelve el resultado original.
   */
  @IsUUID()
  idempotencyKey: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DeviceInfoDto)
  device?: DeviceInfoDto;
}

export class ClockInDto extends LocationFields {
  /** Opcional: por defecto se elige el turno cuya ventana está abierta. */
  @IsOptional()
  @IsUUID()
  shiftId?: string;
}

export class ClockOutDto extends LocationFields {}

export class OfflineEventDto extends LocationFields {
  @IsIn(['CLOCK_IN', 'CLOCK_OUT'])
  type: 'CLOCK_IN' | 'CLOCK_OUT';

  /**
   * Hora del teléfono cuando marcó (sin conexión).
   * @example "2026-10-16T18:58:03.000Z"
   */
  @Instant()
  clientTimestamp: string;

  @ValidateIf(
    (o: OfflineEventDto) => o.type === 'CLOCK_IN' && o.shiftId !== undefined,
  )
  @IsUUID()
  shiftId?: string;
}

export class SyncDto {
  /**
   * Hora ACTUAL del teléfono al enviar. Con ella el servidor mide el desfase
   * del reloj y corrige la hora de cada marcación.
   * @example "2026-10-16T19:40:00.000Z"
   */
  @Instant()
  deviceNow: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => OfflineEventDto)
  events: OfflineEventDto[];
}

export class AdjustAttendanceDto {
  /** null borra la entrada (la jornada queda como ausencia). */
  @IsOptional()
  @Instant()
  clockInAt?: string | null;

  /** null borra la salida. */
  @IsOptional()
  @Instant()
  clockOutAt?: string | null;

  /**
   * Obligatorio: queda en el historial.
   * @example "Olvidó marcar la salida; confirmado con cámaras"
   */
  @Transform(trim)
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  reason: string;
}

export class ReviewAttendanceDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  notes?: string;
}

export class DateRangeDto extends PaginationQueryDto {
  /** Fecha de jornada inicial (inclusive). @example "2026-10-01" */
  @Matches(DATE_ONLY, DATE_MSG)
  @IsISO8601(STRICT)
  from: string;

  /** Fecha de jornada final (inclusive). Máximo 62 días. @example "2026-10-15" */
  @Matches(DATE_ONLY, DATE_MSG)
  @IsISO8601(STRICT)
  to: string;
}

export class ListAttendanceQueryDto extends DateRangeDto {
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsUUID()
  storeId?: string;

  @IsOptional()
  @IsIn(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'INCOMPLETE', 'ABSENT'])
  status?: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'INCOMPLETE' | 'ABSENT';

  /** true = bandeja de pendientes de revisión. */
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  needsReview?: boolean;
}

// ---------------------------------------------------------------------
// Respuestas
// ---------------------------------------------------------------------

export class MetricsDto {
  /** @example 0 */
  lateMinutes: number;
  /** @example 0 */
  earlyLeaveMinutes: number;
  /** @example 420 */
  workedMinutes: number;
  /** Tiempo bruto; se paga solo si se aprueba como novedad. @example 15 */
  overtimeMinutes: number;
}

export class ClockLocationDto {
  withinGeofence: boolean | null;
  /** @example 18.4 */
  distanceMeters: number | null;
  /** @example 12 */
  accuracyMeters: number | null;
}

export class ClockResultDto {
  eventId: string;
  /** @example "CLOCK_IN" */
  type: string;
  accepted: boolean;
  /**
   * Si no fue aceptada: OUTSIDE_GEOFENCE, LOW_GPS_ACCURACY, NO_ACTIVE_GEOFENCE, MOCK_LOCATION,
   * TOO_EARLY, SHIFT_ENDED, SHIFT_CANCELLED, NO_SHIFT, ALREADY_CLOCKED_IN, NOT_CLOCKED_IN,
   * CLOCK_OUT_WINDOW_CLOSED, BEFORE_CLOCK_IN, EMPLOYEE_NOT_ACTIVE, FUTURE_TIMESTAMP, OFFLINE_TOO_OLD.
   * @example null
   */
  rejection: string | null;
  /** Hora oficial registrada (la del servidor, o la corregida si fue offline). */
  effectiveAt: Date;
  /** @example "MOBILE_APP" */
  source: string;
  /** true si fue un reintento con la misma idempotencyKey. */
  replayed: boolean;
  attendanceId: string | null;
  shiftId: string | null;
  location: ClockLocationDto;
  /** Si fue TOO_EARLY: desde cuándo puede marcar. */
  opensAt: Date | null;
  lateMinutes: number | null;
  /** Solo en una salida aceptada. */
  metrics: MetricsDto | null;
  /** La jornada quedó pendiente de revisión del supervisor. */
  needsReview: boolean;
}

export class SyncResultErrorDto {
  /** @example "IDEMPOTENCY_KEY_REUSED" */
  error: string;
  message: string;
}

export class SyncResponseDto {
  serverTime: Date;
  /** Un resultado por evento, en el mismo orden en que se enviaron. */
  results: ClockResultDto[];
}

export class ShiftSummaryDto {
  shiftId: string;
  storeId: string;
  /** @example "Tienda Centro" */
  storeName: string;
  /** @example "America/Bogota" */
  timeZone: string;
  startsAt: Date;
  endsAt: Date;
  /** @example "2026-10-16" */
  localDate: string;
  /** @example "14:00" */
  localStart: string;
  /** @example "22:00" */
  localEnd: string;
  /** @example "SCHEDULED" */
  status: string;
}

export class WindowDto {
  clockInOpensAt: Date;
  lateAfter: Date;
  clockInClosesAt: Date;
  clockOutClosesAt: Date;
}

export class OpenAttendanceDto {
  attendanceId: string;
  clockInAt: Date;
  lateMinutes: number;
  shift: ShiftSummaryDto;
  /** Hasta cuándo puede marcar salida. */
  clockOutClosesAt: Date;
}

export class NextShiftDto {
  shift: ShiftSummaryDto;
  window: WindowDto;
  canClockIn: boolean;
  /** Por qué no puede marcar aún (ej. TOO_EARLY). @example "TOO_EARLY" */
  reason: string | null;
}

export class StatusEmployeeDto {
  id: string;
  firstName: string;
  lastName: string;
  /** @example "ACTIVE" */
  status: string;
}

export class MyStatusResponseDto {
  /** Úsela en la app en lugar del reloj del teléfono. */
  serverTime: Date;
  employee: StatusEmployeeDto;
  openAttendance: OpenAttendanceDto | null;
  nextShift: NextShiftDto | null;
}

export class AttendanceEmployeeDto {
  id: string;
  /** @example "EMP-001" */
  code: string;
  firstName: string;
  lastName: string;
}

export class AttendanceResponseDto {
  id: string;
  /** @example "2026-10-16" */
  workDate: string;
  /** @example "COMPLETED" */
  status: string;
  employee: AttendanceEmployeeDto;
  shift: ShiftSummaryDto;
  clockInAt: Date | null;
  clockOutAt: Date | null;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  workedMinutes: number;
  overtimeMinutes: number;
  needsReview: boolean;
  /** @example ["DEVICE_CLOCK_DRIFT"] */
  reviewReasons: string[];
  reviewedAt: Date | null;
}

export class AttendanceEventDto {
  id: string;
  /** @example "CLOCK_IN" */
  type: string;
  /** @example "ACCEPTED" */
  result: string;
  rejectionReason: string | null;
  /** @example "MOBILE_APP" */
  source: string;
  /** Hora oficial. */
  serverTimestamp: Date;
  /** Hora del teléfono (solo offline). */
  clientTimestamp: Date | null;
  receivedAt: Date;
  clockDriftSeconds: number | null;
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
  distanceMeters: number | null;
  withinGeofence: boolean | null;
  /** Dispositivo, o motivo y valores anteriores en un ajuste manual. */
  deviceInfo: Record<string, unknown> | null;
  /** Admin que hizo el ajuste manual. */
  createdById: string | null;
}

export class AttendanceDetailResponseDto extends AttendanceResponseDto {
  events: AttendanceEventDto[];
}
