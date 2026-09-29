import type { LocationRejection } from '../../stores/domain/geofence.rules';

export type ClockType = 'CLOCK_IN' | 'CLOCK_OUT';
export type EventSource = 'MOBILE_APP' | 'OFFLINE_SYNC' | 'ADMIN_PANEL';
export type AttendanceStatus =
  'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'INCOMPLETE' | 'ABSENT';

/** Motivos por los que se rechaza una marcación. Se guardan en el evento. */
export type ClockRejection =
  | LocationRejection
  | 'EMPLOYEE_NOT_ACTIVE'
  | 'MOCK_LOCATION'
  | 'NO_SHIFT'
  | 'TOO_EARLY'
  | 'SHIFT_ENDED'
  | 'SHIFT_CANCELLED'
  | 'ALREADY_CLOCKED_IN'
  | 'NOT_CLOCKED_IN'
  | 'CLOCK_OUT_WINDOW_CLOSED'
  | 'BEFORE_CLOCK_IN'
  | 'FUTURE_TIMESTAMP'
  | 'OFFLINE_TOO_OLD';

/** Motivos por los que una asistencia aceptada queda marcada para revisión. */
export type ReviewReason =
  'DEVICE_CLOCK_DRIFT' | 'LATE_SYNC' | 'MISSING_CLOCK_OUT' | 'NO_CLOCK_IN';

/** Turno asignado al empleado, con lo necesario para decidir una marcación. */
export interface ShiftForClock {
  assignmentId: string;
  shiftId: string;
  storeId: string;
  storeName: string;
  timeZone: string;
  startsAt: Date;
  endsAt: Date;
  breakMinutes: number;
  earlyClockInMinutes: number;
  lateToleranceMinutes: number;
  status: 'SCHEDULED' | 'CANCELLED';
  /** Asistencia ya registrada para esta asignación, si existe. */
  attendance: {
    id: string;
    clockInAt: Date | null;
    status: AttendanceStatus;
  } | null;
}

export interface WorkMetrics {
  lateMinutes: number;
  earlyLeaveMinutes: number;
  workedMinutes: number;
  overtimeMinutes: number;
}

export interface LocationFixInput {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  /** El sistema operativo reporta ubicación simulada (apps de GPS falso). */
  mocked?: boolean;
}
