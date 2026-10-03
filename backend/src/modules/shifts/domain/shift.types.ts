export type PeriodStatus = 'DRAFT' | 'PUBLISHED' | 'CLOSED';
export type ShiftStatus = 'SCHEDULED' | 'CANCELLED';
export type AssignmentStatus = 'ASSIGNED' | 'CANCELLED';

// ---------- Periodos (quincenas) ----------

export interface PeriodView {
  id: string;
  /** null = aplica a toda la empresa. */
  storeId: string | null;
  storeName: string | null;
  name: string;
  startDate: Date;
  endDate: Date;
  status: PeriodStatus;
  publishedAt: Date | null;
  shiftCount: number;
  createdAt: Date;
}

export interface PeriodFilter {
  status?: PeriodStatus;
  storeId?: string;
}

export interface NewPeriod {
  storeId: string | null;
  name: string;
  startDate: Date;
  endDate: Date;
}

// ---------- Turnos ----------

export interface ShiftTiming {
  startsAt: Date;
  endsAt: Date;
  breakMinutes: number;
  /** Minutos antes del inicio desde los que se puede marcar entrada. */
  earlyClockInMinutes: number;
  /** Minutos de gracia antes de contar tardanza. */
  lateToleranceMinutes: number;
}

export interface AssignmentView {
  id: string;
  employeeId: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  status: AssignmentStatus;
}

export interface ShiftView extends ShiftTiming {
  id: string;
  storeId: string;
  storeName: string;
  /** Zona horaria efectiva (la del establecimiento o la de la empresa). */
  timeZone: string;
  schedulePeriodId: string | null;
  periodStatus: PeriodStatus | null;
  status: ShiftStatus;
  notes: string | null;
  assignments: AssignmentView[];
  createdAt: Date;
  updatedAt: Date;
}

export interface NewShift extends ShiftTiming {
  storeId: string;
  schedulePeriodId: string | null;
  notes: string | null;
}

export interface ShiftFilter {
  from: Date;
  to: Date;
  storeId?: string;
  employeeId?: string;
  schedulePeriodId?: string;
  status?: ShiftStatus;
  /** Solo turnos que el empleado puede ver (periodo publicado o sin periodo). */
  visibleToEmployees?: boolean;
}

/** Un empleado ya ocupado en una franja. */
export interface BusySlot {
  employeeId: string;
  shiftId: string;
  startsAt: Date;
  endsAt: Date;
}

export interface EmployeeForScheduling {
  id: string;
  firstName: string;
  lastName: string;
  status: 'ACTIVE' | 'ON_LEAVE' | 'INACTIVE' | 'TERMINATED';
  hireDate: Date;
  terminationDate: Date | null;
  userId: string | null;
}

export interface SchedulingStore {
  id: string;
  name: string;
  isActive: boolean;
  timeZone: string;
  /** Valores por defecto configurados por la empresa. */
  defaults: {
    breakMinutes: number;
    earlyClockInMinutes: number;
    lateToleranceMinutes: number;
  };
}

export interface ShiftChangeRecord {
  shiftAssignmentId: string;
  type: 'REASSIGNMENT' | 'SWAP' | 'TIME_CHANGE' | 'CANCELLATION';
  fromEmployeeId?: string | null;
  toEmployeeId?: string | null;
  previousStartsAt?: Date | null;
  previousEndsAt?: Date | null;
  newStartsAt?: Date | null;
  newEndsAt?: Date | null;
  reason?: string | null;
  actorUserId: string;
}
