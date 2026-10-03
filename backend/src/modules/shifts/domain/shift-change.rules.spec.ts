import {
  assertCanDo,
  assertEnoughNotice,
  ChangeState,
  ShiftChangeStateError,
  ShiftChangeTooLateError,
  stageOf,
} from './shift-change.rules';

const st = (over: Partial<ChangeState> = {}): ChangeState => ({
  status: 'PENDING',
  peerRespondedAt: null,
  peerAccepted: null,
  ...over,
});
const accepted = st({ peerRespondedAt: new Date(), peerAccepted: true });

describe('stageOf', () => {
  it.each([
    [st(), 'AWAITING_PEER'],
    [accepted, 'AWAITING_APPROVAL'],
    [
      st({
        status: 'REJECTED',
        peerRespondedAt: new Date(),
        peerAccepted: false,
      }),
      'DECLINED_BY_PEER',
    ],
    [{ ...accepted, status: 'REJECTED' as const }, 'REJECTED'],
    [{ ...accepted, status: 'APPROVED' as const }, 'APPROVED'],
    [st({ status: 'CANCELLED' }), 'CANCELLED'],
  ])('%o → %s', (state, stage) => expect(stageOf(state)).toBe(stage));
});

describe('assertCanDo', () => {
  it('el supervisor solo aprueba después de que el compañero acepte', () => {
    expect(() => assertCanDo(st(), 'APPROVE')).toThrow(ShiftChangeStateError);
    expect(() => assertCanDo(accepted, 'APPROVE')).not.toThrow();
  });
  it('el compañero responde una sola vez', () => {
    expect(() => assertCanDo(st(), 'PEER_RESPOND')).not.toThrow();
    expect(() => assertCanDo(accepted, 'PEER_RESPOND')).toThrow(
      ShiftChangeStateError,
    );
  });
  it('una aprobada no se puede cancelar ni rechazar', () => {
    const approved = { ...accepted, status: 'APPROVED' as const };
    expect(() => assertCanDo(approved, 'CANCEL')).toThrow(
      ShiftChangeStateError,
    );
    expect(() => assertCanDo(approved, 'REJECT')).toThrow(
      ShiftChangeStateError,
    );
  });
});

describe('assertEnoughNotice', () => {
  const now = new Date('2026-10-16T12:00:00Z');
  it('exige 60 minutos de anticipación', () => {
    expect(() =>
      assertEnoughNotice(new Date('2026-10-16T13:00:00Z'), now),
    ).not.toThrow();
    expect(() =>
      assertEnoughNotice(new Date('2026-10-16T12:59:00Z'), now),
    ).toThrow(ShiftChangeTooLateError);
  });
});
