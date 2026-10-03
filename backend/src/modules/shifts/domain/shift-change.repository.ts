import type { PageRequest } from '../../../shared/application/page';
import type {
  ChangeKind,
  ChangeStage,
  ChangeState,
} from './shift-change.rules';
import type { PeriodStatus } from './shift.types';

export interface ShiftRef {
  shiftId: string;
  startsAt: Date;
  endsAt: Date;
  storeName: string;
  timeZone: string;
}

export interface AssignmentContext {
  assignmentId: string;
  employeeId: string;
  status: 'ASSIGNED' | 'CANCELLED';
  shift: ShiftRef & {
    status: 'SCHEDULED' | 'CANCELLED';
    periodStatus: PeriodStatus | null;
  };
}

export interface Coworker {
  id: string;
  firstName: string;
  lastName: string;
  status: 'ACTIVE' | 'ON_LEAVE' | 'INACTIVE' | 'TERMINATED';
  userId: string | null;
}

export interface Participant {
  employeeId: string;
  firstName: string;
  lastName: string;
  userId: string | null;
}

export interface ShiftChangeView {
  id: string;
  kind: ChangeKind;
  state: ChangeState;
  requester: Participant;
  peer: Participant;
  /** Turno que entrega quien pide. */
  shift: ShiftRef;
  /** Turno que recibe a cambio (solo intercambios). */
  peerShift: ShiftRef | null;
  shiftAssignmentId: string;
  counterpartAssignmentId: string | null;
  reason: string | null;
  reviewNotes: string | null;
  peerRespondedAt: Date | null;
  reviewedAt: Date | null;
  createdAt: Date;
}

export interface ShiftChangeFilter {
  /** Solicitudes donde la persona pide o es el compañero. */
  participantEmployeeId?: string;
  stage?: ChangeStage;
}

export abstract class ShiftChangeRepository {
  abstract findAssignment(
    companyId: string,
    shiftId: string,
    employeeId: string,
  ): Promise<AssignmentContext | null>;
  abstract findCoworker(
    companyId: string,
    employeeId: string,
  ): Promise<Coworker | null>;
  /** Solicitud PENDING que ya involucra alguna de estas asignaciones. */
  abstract pendingFor(
    companyId: string,
    assignmentIds: string[],
  ): Promise<string | null>;

  abstract create(
    companyId: string,
    data: {
      kind: ChangeKind;
      shiftAssignmentId: string;
      counterpartAssignmentId: string | null;
      requesterEmployeeId: string;
      peerEmployeeId: string;
      shift: ShiftRef;
      peerShift: ShiftRef | null;
      reason: string | null;
      requestedById: string;
    },
  ): Promise<string>;

  abstract findById(
    companyId: string,
    id: string,
  ): Promise<ShiftChangeView | null>;
  abstract list(
    companyId: string,
    filter: ShiftChangeFilter,
    page: PageRequest,
  ): Promise<{ items: ShiftChangeView[]; total: number }>;

  /** Cambio condicional: solo si sigue PENDING y en la etapa esperada (evita carreras). */
  abstract transition(
    companyId: string,
    id: string,
    expectPeerResponded: boolean,
    data: {
      status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
      peerRespondedAt?: Date;
      peerAccepted?: boolean;
      reviewNotes?: string | null;
      reviewedById?: string | null;
      reviewedAt?: Date | null;
    },
    fromStatus?: 'PENDING' | 'APPROVED',
  ): Promise<boolean>;

  /** Compañeros activos con app que podrían cubrir el turno (aún sin filtrar cruces). */
  abstract coverCandidates(
    companyId: string,
    shiftId: string,
    excludeEmployeeId: string,
  ): Promise<Coworker[]>;
  /** Turnos de compañeros en el rango que podrían intercambiarse (aún sin filtrar cruces). */
  abstract swapOptions(
    companyId: string,
    requesterEmployeeId: string,
    from: Date,
    to: Date,
  ): Promise<(AssignmentContext & { employee: Coworker })[]>;

  /** Usuarios con permiso para aprobar cambios en la empresa. */
  abstract approverUserIds(companyId: string): Promise<string[]>;
}
