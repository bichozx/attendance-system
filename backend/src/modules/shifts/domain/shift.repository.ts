import type { PageRequest } from '../../../shared/application/page';
import type { ConflictDetail } from './shift.errors';
import type { Candidate } from './shift.rules';
import type {
  EmployeeForScheduling,
  NewPeriod,
  NewShift,
  PeriodFilter,
  PeriodStatus,
  PeriodView,
  SchedulingStore,
  ShiftChangeRecord,
  ShiftFilter,
  ShiftTiming,
  ShiftView,
} from './shift.types';

export abstract class SchedulePeriodRepository {
  abstract list(
    companyId: string,
    filter: PeriodFilter,
    page: PageRequest,
  ): Promise<{ items: PeriodView[]; total: number }>;
  abstract findById(companyId: string, id: string): Promise<PeriodView | null>;
  /** Periodo que se cruza en fechas con el mismo alcance (misma tienda o empresa completa). */
  abstract findOverlapping(
    companyId: string,
    candidate: NewPeriod,
    excludeId?: string,
  ): Promise<{ id: string; name: string } | null>;
  abstract create(companyId: string, data: NewPeriod): Promise<PeriodView>;
  abstract update(
    companyId: string,
    id: string,
    changes: Partial<NewPeriod>,
  ): Promise<PeriodView>;
  abstract setStatus(
    companyId: string,
    id: string,
    status: PeriodStatus,
    actorUserId: string,
  ): Promise<PeriodView>;
  /** Borra el periodo con sus turnos y asignaciones (solo borradores). */
  abstract deleteWithShifts(companyId: string, id: string): Promise<void>;
  abstract countActiveShifts(companyId: string, id: string): Promise<number>;
  /** Usuarios (con app) que tienen turnos activos en el periodo. */
  abstract findAssignedUserIds(
    companyId: string,
    id: string,
  ): Promise<string[]>;
  abstract companyTimeZone(companyId: string): Promise<string>;
}

export interface ShiftToCreate {
  shift: NewShift;
  employeeIds: string[];
}

/**
 * Las operaciones que asignan personas o mueven horarios validan los cruces
 * DENTRO de la transacción, con bloqueo por empleado: dos admins simultáneos
 * no pueden dejar a alguien con turnos cruzados.
 */
export abstract class ShiftRepository {
  abstract list(companyId: string, filter: ShiftFilter): Promise<ShiftView[]>;
  abstract findById(companyId: string, id: string): Promise<ShiftView | null>;

  abstract findSchedulingStore(
    companyId: string,
    storeId: string,
  ): Promise<SchedulingStore | null>;
  abstract findEmployees(
    companyId: string,
    ids: string[],
  ): Promise<EmployeeForScheduling[]>;
  abstract findEmployeeIdByUser(
    companyId: string,
    userId: string,
  ): Promise<string | null>;

  /** Incapacidades y permisos APROBADOS que se cruzan con el rango. */
  abstract findApprovedTimeOff(
    companyId: string,
    employeeIds: string[],
    from: Date,
    to: Date,
  ): Promise<{ employeeId: string; startsAt: Date; endsAt: Date }[]>;

  /** Crea turnos con sus asignaciones. Lanza ScheduleConflictError si hay cruces. */
  abstract createMany(
    companyId: string,
    items: ShiftToCreate[],
    actorUserId: string,
  ): Promise<string[]>;

  /** Cambia horario. Lanza ScheduleConflictError si algún asignado queda cruzado. */
  abstract reschedule(
    companyId: string,
    id: string,
    timing: ShiftTiming,
    notes: string | null | undefined,
  ): Promise<void>;

  /** Asigna (o reactiva) empleados. Devuelve los ids de asignación nuevos o reactivados. */
  abstract assign(
    companyId: string,
    shiftId: string,
    employeeIds: string[],
    actorUserId: string,
  ): Promise<{ assignmentId: string; employeeId: string }[]>;

  abstract unassign(
    companyId: string,
    shiftId: string,
    employeeId: string,
  ): Promise<string>;
  abstract cancel(companyId: string, id: string): Promise<void>;

  abstract recordChanges(
    companyId: string,
    changes: ShiftChangeRecord[],
  ): Promise<void>;
  abstract findUserIdsByEmployee(
    companyId: string,
    employeeIds: string[],
  ): Promise<Map<string, string>>;

  /**
   * Revisión SIN bloqueo de cruces, ignorando las asignaciones que se van a liberar.
   * Sirve para filtrar opciones; la validación definitiva la hace applyMoves.
   */
  abstract previewConflicts(
    companyId: string,
    candidates: Candidate[],
    vacating: string[],
  ): Promise<ConflictDetail[]>;

  /**
   * Mueve personas entre turnos en UNA transacción con bloqueo de los empleados:
   * libera cada asignación de origen (debe seguir ASSIGNED y el turno sin empezar),
   * valida cruces y asigna. Si algo falla, no se mueve nada.
   * Lanza ShiftChangeStaleError si una asignación ya no está como se pidió.
   */
  abstract applyMoves(
    companyId: string,
    moves: {
      vacateAssignmentId: string;
      employeeId: string;
      shiftId: string;
    }[],
    actorUserId: string,
  ): Promise<void>;
}
