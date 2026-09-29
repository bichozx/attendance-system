import type { PageRequest } from '../../../shared/application/page';
import type {
  AttendanceForIncident,
  IncidentFilter,
  IncidentStatus,
  IncidentType,
  IncidentView,
  NewIncident,
} from './incident.types';
import type {
  TimesheetAttendance,
  TimesheetEmployee,
  TimesheetIncident,
} from './timesheet';

export interface AffectedShift {
  shiftId: string;
  startsAt: Date;
  endsAt: Date;
  storeName: string;
  timeZone: string;
}

export abstract class IncidentRepository {
  abstract findEmployeeByUser(
    companyId: string,
    userId: string,
  ): Promise<{ id: string } | null>;
  abstract findEmployee(
    companyId: string,
    id: string,
  ): Promise<{ id: string; userId: string | null } | null>;
  abstract companyTimeZone(companyId: string): Promise<string>;
  abstract findAttendance(
    companyId: string,
    id: string,
  ): Promise<AttendanceForIncident | null>;

  /** Novedad PENDING o APPROVED del mismo tipo sobre la misma jornada. */
  abstract findActiveForAttendance(
    companyId: string,
    attendanceId: string,
    type: IncidentType,
  ): Promise<string | null>;
  /** Incapacidad o permiso PENDING/APPROVED que se cruza con el rango. */
  abstract findOverlappingTimeOff(
    companyId: string,
    employeeId: string,
    startsAt: Date,
    endsAt: Date,
  ): Promise<string | null>;

  abstract create(companyId: string, data: NewIncident): Promise<IncidentView>;
  abstract list(
    companyId: string,
    filter: IncidentFilter,
    page: PageRequest,
  ): Promise<{ items: IncidentView[]; total: number }>;
  abstract findById(
    companyId: string,
    id: string,
  ): Promise<IncidentView | null>;

  /**
   * Cambia el estado solo si sigue en `from` (dos supervisores aprobando a la vez:
   * solo uno gana). Devuelve false si otro ya lo cambió.
   */
  abstract transition(
    companyId: string,
    id: string,
    from: IncidentStatus,
    change: {
      status: IncidentStatus;
      reviewedById: string | null;
      reviewNotes: string | null;
      minutes?: number;
    },
  ): Promise<boolean>;

  /** Ausencias pendientes de revisión que caen dentro del rango. */
  abstract findCoveredAbsences(
    companyId: string,
    employeeId: string,
    startsAt: Date,
    endsAt: Date,
  ): Promise<string[]>;
  abstract markAttendancesReviewed(
    companyId: string,
    attendanceIds: string[],
    actorUserId: string,
  ): Promise<void>;
  /** Turnos FUTUROS asignados al empleado que se cruzan con el rango. */
  abstract findAffectedShifts(
    companyId: string,
    employeeId: string,
    startsAt: Date,
    endsAt: Date,
  ): Promise<AffectedShift[]>;

  abstract timesheetData(
    companyId: string,
    filter: {
      from: Date;
      to: Date;
      rangeStart: Date;
      rangeEnd: Date;
      employeeId?: string;
      storeId?: string;
    },
  ): Promise<{
    employees: TimesheetEmployee[];
    attendances: TimesheetAttendance[];
    incidents: TimesheetIncident[];
  }>;
}
