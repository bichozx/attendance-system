import type { ShiftForClock } from './attendance.types';
import {
  computeWorkMetrics,
  evaluateClockOut,
  evaluateOfflineTiming,
  selectShiftForClockIn,
} from './attendance.rules';

/** Hora de Bogotá del 16/10/2026 → Date UTC. */
const bog = (hhmm: string, dayOffset = 0) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(2026, 9, 16 + dayOffset, h + 5, m));
};

const shift = (
  id: string,
  start: string,
  end: string,
  over: Partial<ShiftForClock> = {},
): ShiftForClock => ({
  assignmentId: `a-${id}`,
  shiftId: id,
  storeId: 'st',
  storeName: 'Centro',
  timeZone: 'America/Bogota',
  startsAt: bog(start),
  endsAt: end <= start ? bog(end, 1) : bog(end),
  breakMinutes: 60,
  earlyClockInMinutes: 5,
  lateToleranceMinutes: 5,
  status: 'SCHEDULED',
  attendance: null,
  ...over,
});

describe('selectShiftForClockIn', () => {
  const manana = shift('manana', '06:00', '14:00');
  const tarde = shift('tarde', '14:00', '22:00');

  it('elige el turno cuya ventana está abierta', () => {
    expect(selectShiftForClockIn([tarde], bog('13:56')).shift?.shiftId).toBe(
      'tarde',
    );
  });

  it('turnos seguidos: a las 13:57 elige el que aún no tiene entrada', () => {
    const conEntrada = {
      ...manana,
      attendance: {
        id: 'x',
        clockInAt: bog('05:58'),
        status: 'IN_PROGRESS' as const,
      },
    };
    const r = selectShiftForClockIn([conEntrada, tarde], bog('13:57'));
    expect([r.shift?.shiftId, r.rejection]).toEqual(['tarde', null]);
  });

  it('demasiado temprano: informa cuándo abre', () => {
    const r = selectShiftForClockIn([tarde], bog('13:00'));
    expect(r.rejection).toBe('TOO_EARLY');
    expect(r.rejection === 'TOO_EARLY' && r.opensAt?.toISOString()).toBe(
      bog('13:55').toISOString(),
    );
  });

  it('ya marcó entrada', () => {
    const r = selectShiftForClockIn(
      [
        {
          ...tarde,
          attendance: {
            id: 'x',
            clockInAt: bog('13:58'),
            status: 'IN_PROGRESS',
          },
        },
      ],
      bog('14:30'),
    );
    expect(r.rejection).toBe('ALREADY_CLOCKED_IN');
  });

  it('turno cancelado, turno terminado y sin turno', () => {
    expect(
      selectShiftForClockIn([{ ...tarde, status: 'CANCELLED' }], bog('14:00'))
        .rejection,
    ).toBe('SHIFT_CANCELLED');
    expect(selectShiftForClockIn([manana], bog('15:00')).rejection).toBe(
      'SHIFT_ENDED',
    );
    expect(selectShiftForClockIn([], bog('15:00')).rejection).toBe('NO_SHIFT');
  });
});

describe('computeWorkMetrics (turno 14:00–22:00, 60 min de descanso, 5 de tolerancia)', () => {
  const t = shift('t', '14:00', '22:00');

  it('jornada completa: 7 horas trabajadas', () => {
    expect(computeWorkMetrics(t, bog('13:57'), bog('22:00'))).toEqual({
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      workedMinutes: 420,
      overtimeMinutes: 0,
    });
  });

  it('llegar temprano no suma minutos', () => {
    expect(
      computeWorkMetrics(t, bog('13:55'), bog('22:00')).workedMinutes,
    ).toBe(420);
  });

  it('tarde, salida anticipada y tiempo extra', () => {
    expect(computeWorkMetrics(t, bog('14:20'), bog('21:30'))).toMatchObject({
      lateMinutes: 20,
      earlyLeaveMinutes: 30,
      workedMinutes: 370,
    });
    expect(
      computeWorkMetrics(t, bog('14:00'), bog('23:15')).overtimeMinutes,
    ).toBe(75);
  });
});

describe('evaluateClockOut', () => {
  const t = shift('t', '14:00', '22:00');
  it('acepta hasta 4 h después del fin y rechaza después', () => {
    expect(evaluateClockOut(t, bog('14:00'), bog('02:00', 1))).toBeNull();
    expect(evaluateClockOut(t, bog('14:00'), bog('02:01', 1))).toBe(
      'CLOCK_OUT_WINDOW_CLOSED',
    );
  });
  it('rechaza una salida anterior a la entrada', () => {
    expect(evaluateClockOut(t, bog('14:00'), bog('13:59'))).toBe(
      'BEFORE_CLOCK_IN',
    );
  });
});

describe('evaluateOfflineTiming', () => {
  const server = new Date('2026-10-16T20:00:00Z');

  it('reloj correcto: la hora del teléfono se acepta tal cual', () => {
    const r = evaluateOfflineTiming(
      new Date('2026-10-16T19:00:00Z'),
      server,
      server,
    );
    expect(r).toMatchObject({
      rejection: null,
      driftSeconds: 0,
      reviewReasons: [],
    });
    expect(r.effectiveAt.toISOString()).toBe('2026-10-16T19:00:00.000Z');
  });

  it('corrige un teléfono atrasado 10 minutos y pide revisión', () => {
    const phoneNow = new Date(server.getTime() - 10 * 60_000);
    const r = evaluateOfflineTiming(
      new Date('2026-10-16T18:50:00Z'),
      phoneNow,
      server,
    );
    expect(r.effectiveAt.toISOString()).toBe('2026-10-16T19:00:00.000Z');
    expect(r.reviewReasons).toEqual(['DEVICE_CLOCK_DRIFT']);
  });

  it('rechaza marcaciones en el futuro y demasiado viejas', () => {
    expect(
      evaluateOfflineTiming(new Date('2026-10-16T21:00:00Z'), server, server)
        .rejection,
    ).toBe('FUTURE_TIMESTAMP');
    expect(
      evaluateOfflineTiming(new Date('2026-10-13T00:00:00Z'), server, server)
        .rejection,
    ).toBe('OFFLINE_TOO_OLD');
  });

  it('sincronizar 6 horas después pide revisión', () => {
    expect(
      evaluateOfflineTiming(new Date('2026-10-16T14:00:00Z'), server, server)
        .reviewReasons,
    ).toEqual(['LATE_SYNC']);
  });
});
