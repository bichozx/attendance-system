import { DomainError } from '../../../shared/domain/domain-error';

/** COVER: el compañero toma mi turno. SWAP: intercambiamos turnos. */
export type ChangeKind = 'COVER' | 'SWAP';

export type ChangeStage =
  | 'AWAITING_PEER' // esperando que el compañero acepte
  | 'AWAITING_APPROVAL' // el compañero aceptó; falta el supervisor
  | 'APPROVED'
  | 'REJECTED' // rechazada por el supervisor
  | 'DECLINED_BY_PEER'
  | 'CANCELLED'; // retirada por quien la pidió, o vencida

export const CHANGE_POLICY = {
  /** Anticipación mínima para pedir o aceptar un cambio. */
  minNoticeMinutes: 60,
} as const;

export interface ChangeState {
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  peerRespondedAt: Date | null;
  peerAccepted: boolean | null;
}

export function stageOf(s: ChangeState): ChangeStage {
  switch (s.status) {
    case 'APPROVED':
      return 'APPROVED';
    case 'CANCELLED':
      return 'CANCELLED';
    case 'REJECTED':
      return s.peerAccepted === false ? 'DECLINED_BY_PEER' : 'REJECTED';
    default:
      return s.peerRespondedAt ? 'AWAITING_APPROVAL' : 'AWAITING_PEER';
  }
}

export type ChangeAction = 'PEER_RESPOND' | 'CANCEL' | 'APPROVE' | 'REJECT';

const ALLOWED: Record<ChangeAction, ChangeStage[]> = {
  PEER_RESPOND: ['AWAITING_PEER'],
  CANCEL: ['AWAITING_PEER', 'AWAITING_APPROVAL'],
  APPROVE: ['AWAITING_APPROVAL'],
  // El supervisor puede rechazar incluso antes de que el compañero responda
  REJECT: ['AWAITING_PEER', 'AWAITING_APPROVAL'],
};

const STAGE_LABEL: Record<ChangeStage, string> = {
  AWAITING_PEER: 'esperando al compañero',
  AWAITING_APPROVAL: 'esperando al supervisor',
  APPROVED: 'aprobada',
  REJECTED: 'rechazada',
  DECLINED_BY_PEER: 'no aceptada por el compañero',
  CANCELLED: 'cancelada',
};

export function assertCanDo(state: ChangeState, action: ChangeAction): void {
  const stage = stageOf(state);
  if (!ALLOWED[action].includes(stage)) {
    throw new ShiftChangeStateError(`La solicitud está ${STAGE_LABEL[stage]}`);
  }
}

export function assertEnoughNotice(shiftStartsAt: Date, now: Date): void {
  const minutesLeft = (shiftStartsAt.getTime() - now.getTime()) / 60_000;
  if (minutesLeft < CHANGE_POLICY.minNoticeMinutes) {
    throw new ShiftChangeTooLateError();
  }
}

// ---------------------------------------------------------------------
// Errores
// ---------------------------------------------------------------------

export class ShiftChangeNotFoundError extends DomainError {
  readonly code = 'SHIFT_CHANGE_NOT_FOUND';
  readonly kind = 'NOT_FOUND';
  constructor() {
    super('La solicitud de cambio no existe');
  }
}

export class ShiftChangeStateError extends DomainError {
  readonly code = 'SHIFT_CHANGE_STATE';
  readonly kind = 'CONFLICT';
}

export class ShiftChangeTooLateError extends DomainError {
  readonly code = 'SHIFT_CHANGE_TOO_LATE';
  readonly kind = 'CONFLICT';
  constructor() {
    super(
      `Los cambios se piden con al menos ${CHANGE_POLICY.minNoticeMinutes} minutos de anticipación. Habla con tu supervisor.`,
    );
  }
}

export class ShiftChangeAlreadyPendingError extends DomainError {
  readonly code = 'SHIFT_CHANGE_ALREADY_PENDING';
  readonly kind = 'CONFLICT';
  constructor(id: string) {
    super('Ya hay una solicitud pendiente para ese turno', {
      shiftChangeId: id,
    });
  }
}

export class InvalidShiftChangeError extends DomainError {
  readonly code = 'INVALID_SHIFT_CHANGE';
  readonly kind = 'VALIDATION';
}

/** El turno o la asignación cambiaron desde que se pidió: la solicitud ya no aplica. */
export class ShiftChangeStaleError extends DomainError {
  readonly code = 'SHIFT_CHANGE_STALE';
  readonly kind = 'CONFLICT';
  constructor() {
    super(
      'Los turnos cambiaron desde que se hizo la solicitud; quedó cancelada',
    );
  }
}

export class SelfApprovalForbiddenError extends DomainError {
  readonly code = 'SELF_APPROVAL_FORBIDDEN';
  readonly kind = 'FORBIDDEN';
  constructor() {
    super('No puede aprobar ni rechazar una solicitud en la que participa');
  }
}
