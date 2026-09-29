import type { PageRequest } from '../../../shared/application/page';
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
}
