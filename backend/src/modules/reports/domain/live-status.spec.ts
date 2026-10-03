import { liveStatus, LiveInput } from './live-status';

/** Turno 14:00–22:00 (Bogotá) con 5 min de tolerancia. */
const bog = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(2026, 9, 16, h + 5, m));
};
const base: LiveInput = {
  startsAt: bog('14:00'),
  endsAt: bog('22:00'),
  lateToleranceMinutes: 5,
  attendance: null,
  onTimeOff: false,
};
const att = (
  status: NonNullable<LiveInput['attendance']>['status'],
  lateMinutes = 0,
) => ({
  ...base,
  attendance: {
    status,
    clockInAt: status === 'ABSENT' ? null : bog('14:00'),
    lateMinutes,
  },
});

describe('liveStatus', () => {
  it.each([
    ['13:50', base, 'UPCOMING'],
    ['14:05', base, 'UPCOMING'], // aún dentro de la tolerancia
    ['14:06', base, 'MISSING'],
    ['22:00', base, 'ABSENT'],
    ['15:00', att('IN_PROGRESS', 20), 'WORKING'],
    ['22:10', att('IN_PROGRESS'), 'PENDING_EXIT'],
    ['22:10', att('COMPLETED'), 'COMPLETED'],
    ['23:59', att('INCOMPLETE'), 'INCOMPLETE'],
    ['15:00', att('ABSENT'), 'ABSENT'],
    ['15:00', { ...base, onTimeOff: true }, 'ON_TIME_OFF'],
  ] as const)('a las %s → %s', (time, input, expected) => {
    expect(liveStatus(input, bog(time))).toBe(expected);
  });

  it('si con permiso igual llegó a trabajar, cuenta lo que hizo', () => {
    expect(
      liveStatus({ ...att('IN_PROGRESS'), onTimeOff: true }, bog('16:00')),
    ).toBe('WORKING');
  });
});
