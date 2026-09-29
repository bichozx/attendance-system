export type IncidentType =
  | 'SICK_LEAVE'
  | 'PERMISSION'
  | 'ABSENCE'
  | 'LATE_ARRIVAL'
  | 'EARLY_DEPARTURE'
  | 'OVERTIME'
  | 'MISSED_CLOCK'
  | 'SHIFT_CHANGE'
  | 'GPS_APP_ISSUE'
  | 'OTHER';

export type IncidentStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface IncidentView {
  id: string;
  employee: {
    id: string;
    code: string;
    firstName: string;
    lastName: string;
    userId: string | null;
  };
  type: IncidentType;
  status: IncidentStatus;
  attendanceId: string | null;
  /** Periodo que cubre la novedad (en MISSED_CLOCK: la entrada y salida propuestas). */
  startsAt: Date;
  endsAt: Date | null;
  /** Minutos que se justifican o se solicitan (tardanza, extra...). */
  minutes: number | null;
  description: string | null;
  attachmentUrl: string | null;
  requestedById: string | null;
  reviewedById: string | null;
  reviewedAt: Date | null;
  reviewNotes: string | null;
  createdAt: Date;
}

export interface IncidentFilter {
  from?: Date;
  to?: Date;
  employeeId?: string;
  type?: IncidentType;
  status?: IncidentStatus;
}

export interface NewIncident {
  employeeId: string;
  type: IncidentType;
  status: IncidentStatus;
  attendanceId: string | null;
  startsAt: Date;
  endsAt: Date | null;
  minutes: number | null;
  description: string;
  attachmentUrl: string | null;
  requestedById: string;
  reviewedById?: string | null;
  reviewedAt?: Date | null;
}

/** Asistencia vista desde una novedad: lo necesario para validar minutos y horas. */
export interface AttendanceForIncident {
  id: string;
  employeeId: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'INCOMPLETE' | 'ABSENT';
  clockInAt: Date | null;
  clockOutAt: Date | null;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
  shift: { startsAt: Date; endsAt: Date; timeZone: string };
}
