import type { PageRequest } from '../../../shared/application/page';
import type {
  AttendanceStatus,
  ClockRejection,
  ClockType,
  EventSource,
  ReviewReason,
  ShiftForClock,
  WorkMetrics,
} from './attendance.types';

export interface ClockingEmployee {
  id: string;
  status: 'ACTIVE' | 'ON_LEAVE' | 'INACTIVE' | 'TERMINATED';
  firstName: string;
  lastName: string;
}

export interface AttendanceRecord {
  id: string;
  shiftAssignmentId: string;
  employeeId: string;
  workDate: Date;
  status: AttendanceStatus;
  clockInAt: Date | null;
  clockOutAt: Date | null;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  workedMinutes: number;
  overtimeMinutes: number;
  needsReview: boolean;
  reviewReasons: string[];
}

export interface StoredEvent {
  id: string;
  employeeId: string;
  type: ClockType | 'MANUAL_ADJUSTMENT';
  result: 'ACCEPTED' | 'REJECTED';
  rejectionReason: string | null;
  source: EventSource;
  serverTimestamp: Date;
  distanceMeters: number | null;
  accuracyMeters: number | null;
  withinGeofence: boolean | null;
  attendance: (AttendanceRecord & { shiftId: string }) | null;
}

export interface NewEvent {
  employeeId: string;
  attendanceId: string | null;
  type: ClockType | 'MANUAL_ADJUSTMENT';
  result: 'ACCEPTED' | 'REJECTED';
  rejectionReason: ClockRejection | null;
  source: EventSource;
  /** Hora oficial de la marcación. */
  serverTimestamp: Date;
  clientTimestamp: Date | null;
  clockDriftSeconds: number | null;
  latitude?: number | null;
  longitude?: number | null;
  accuracyMeters?: number | null;
  distanceMeters?: number | null;
  withinGeofence?: boolean | null;
  geofenceId?: string | null;
  deviceInfo?: Record<string, unknown> | null;
  idempotencyKey: string | null;
  createdById?: string | null;
}

export interface Fix {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
}

/** Operaciones que corren dentro de la transacción bloqueada de un empleado. */
export interface AttendanceUnitOfWork {
  findShiftsAround(employeeId: string, at: Date): Promise<ShiftForClock[]>;
  findOpenAttendance(
    employeeId: string,
  ): Promise<{ attendance: AttendanceRecord; shift: ShiftForClock } | null>;
  findEventByKey(key: string): Promise<StoredEvent | null>;
  recordClockIn(data: {
    shift: ShiftForClock;
    employeeId: string;
    workDate: Date;
    at: Date;
    fix: Fix;
    lateMinutes: number;
    reviewReasons: ReviewReason[];
  }): Promise<AttendanceRecord>;
  recordClockOut(
    attendanceId: string,
    data: {
      at: Date;
      fix: Fix;
      metrics: WorkMetrics;
      reviewReasons: ReviewReason[];
    },
  ): Promise<AttendanceRecord>;
  saveEvent(event: NewEvent): Promise<StoredEvent>;
}

export interface AttendanceFilter {
  from: Date; // workDate desde (inclusive)
  to: Date; // workDate hasta (inclusive)
  employeeId?: string;
  storeId?: string;
  status?: AttendanceStatus;
  needsReview?: boolean;
}

export interface AttendanceListItem extends AttendanceRecord {
  employee: { id: string; code: string; firstName: string; lastName: string };
  shift: ShiftForClock;
  reviewedAt: Date | null;
}

export interface AttendanceDetail extends AttendanceListItem {
  events: (Omit<StoredEvent, 'attendance'> & {
    clientTimestamp: Date | null;
    receivedAt: Date;
    clockDriftSeconds: number | null;
    latitude: number | null;
    longitude: number | null;
    deviceInfo: unknown;
    createdById: string | null;
  })[];
}

export interface Adjustment {
  status: AttendanceStatus;
  clockInAt: Date | null;
  clockOutAt: Date | null;
  metrics: WorkMetrics;
  actorUserId: string;
  reason: string;
  before: {
    clockInAt: Date | null;
    clockOutAt: Date | null;
    status: AttendanceStatus;
  };
}

export interface OverdueResult {
  /** Asistencias que quedaron sin salida (para notificar al empleado). */
  incomplete: {
    companyId: string;
    userId: string | null;
    shiftStartsAt: Date;
    timeZone: string;
  }[];
  absent: number;
  /** false si otra instancia ya estaba ejecutando el cierre. */
  ran: boolean;
}

export abstract class AttendanceRepository {
  abstract findEmployeeByUser(
    companyId: string,
    userId: string,
  ): Promise<ClockingEmployee | null>;
  abstract findEventByKey(
    companyId: string,
    key: string,
  ): Promise<StoredEvent | null>;

  /** Ejecuta `work` en una transacción con bloqueo exclusivo sobre el empleado. */
  abstract inEmployeeLock<T>(
    companyId: string,
    employeeId: string,
    work: (uow: AttendanceUnitOfWork) => Promise<T>,
  ): Promise<T>;

  /** Lecturas fuera de transacción (pantalla de estado del empleado). */
  abstract reader(
    companyId: string,
  ): Pick<AttendanceUnitOfWork, 'findShiftsAround' | 'findOpenAttendance'>;

  abstract list(
    companyId: string,
    filter: AttendanceFilter,
    page: PageRequest,
  ): Promise<{ items: AttendanceListItem[]; total: number }>;
  abstract findDetail(
    companyId: string,
    id: string,
  ): Promise<AttendanceDetail | null>;

  abstract applyAdjustment(
    companyId: string,
    id: string,
    adj: Adjustment,
  ): Promise<void>;
  abstract markReviewed(
    companyId: string,
    id: string,
    actorUserId: string,
  ): Promise<void>;

  /** Cierra jornadas vencidas: sin salida → INCOMPLETE; sin entrada → ABSENT. */
  abstract closeOverdue(
    now: Date,
    clockOutGraceMinutes: number,
  ): Promise<OverdueResult>;
}
