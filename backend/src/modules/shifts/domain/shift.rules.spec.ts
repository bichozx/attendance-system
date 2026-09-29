import { parseDateOnly as d } from '../../../shared/domain/date-only';
import {
  InvalidPeriodDatesError,
  InvalidShiftTimingError,
} from './shift.errors';
import {
  assertPeriodDates,
  assertShiftTiming,
  clockWindow,
  evaluateClockIn,
  findConflicts,
  scheduledWorkMinutes,
  unavailabilityReason,
} from './shift.rules';
import type { EmployeeForScheduling, ShiftTiming } from './shift.types';

const at = (iso: string) => new Date(iso);
/** Turno de 14:00 a 22:00 hora Bogotá (19:00–03:00 UTC). */
const shift: ShiftTiming & { status: 'SCHEDULED' } = {
  startsAt: at('2026-10-16T19:00:00Z'),
  endsAt: at('2026-10-17T03:00:00Z'),
  breakMinutes: 60,
  earlyClockInMinutes: 5,
  lateToleranceMinutes: 5,
  status: 'SCHEDULED',
};

describe('assertShiftTiming', () => {
  it('acepta un turno normal y calcula tiempo laborable', () => {
    expect(() => assertShiftTiming(shift)).not.toThrow();
    expect(scheduledWorkMinutes(shift)).toBe(7 * 60);
  });

  it('rechaza turnos de más de 16 horas y descansos mayores al turno', () => {
    expect(() =>
      assertShiftTiming({ ...shift, endsAt: at('2026-10-17T12:00:00Z') }),
    ).toThrow(InvalidShiftTimingError);
    expect(() => assertShiftTiming({ ...shift, breakMinutes: 480 })).toThrow(
      InvalidShiftTimingError,
    );
  });
});

describe('assertPeriodDates', () => {
  it('acepta una quincena y rechaza periodos de más de 31 días o invertidos', () => {
    expect(() =>
      assertPeriodDates(d('2026-10-01'), d('2026-10-15')),
    ).not.toThrow();
    expect(() => assertPeriodDates(d('2026-10-01'), d('2026-11-15'))).toThrow(
      InvalidPeriodDatesError,
    );
    expect(() => assertPeriodDates(d('2026-10-15'), d('2026-10-01'))).toThrow(
      InvalidPeriodDatesError,
    );
  });
});

describe('findConflicts', () => {
  const busy = [
    {
      employeeId: 'e1',
      shiftId: 's-manana',
      startsAt: at('2026-10-16T11:00:00Z'),
      endsAt: at('2026-10-16T19:00:00Z'),
    },
  ];

  it('turnos seguidos (uno termina cuando empieza el otro) no se cruzan', () => {
    expect(findConflicts([{ employeeId: 'e1', ...shift }], busy)).toEqual([]);
  });

  it('detecta un cruce de una hora', () => {
    const conflicts = findConflicts(
      [
        {
          employeeId: 'e1',
          startsAt: at('2026-10-16T18:00:00Z'),
          endsAt: at('2026-10-17T02:00:00Z'),
        },
      ],
      busy,
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].conflictingShiftId).toBe('s-manana');
  });

  it('no se cruza consigo mismo al editar el turno', () => {
    const editing = {
      employeeId: 'e1',
      shiftId: 's-manana',
      startsAt: at('2026-10-16T12:00:00Z'),
      endsAt: at('2026-10-16T20:00:00Z'),
    };
    expect(findConflicts([editing], busy)).toEqual([]);
  });

  it('otro empleado en el mismo horario no es cruce', () => {
    expect(
      findConflicts(
        [
          {
            employeeId: 'e2',
            startsAt: busy[0].startsAt,
            endsAt: busy[0].endsAt,
          },
        ],
        busy,
      ),
    ).toEqual([]);
  });

  it('detecta cruces dentro del mismo lote', () => {
    const conflicts = findConflicts(
      [
        { employeeId: 'e3', ...shift },
        {
          employeeId: 'e3',
          startsAt: at('2026-10-16T21:00:00Z'),
          endsAt: at('2026-10-17T05:00:00Z'),
        },
      ],
      [],
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].conflictingShiftId).toBeNull();
  });
});

describe('unavailabilityReason', () => {
  const emp: EmployeeForScheduling = {
    id: 'e1',
    firstName: 'A',
    lastName: 'B',
    status: 'ACTIVE',
    hireDate: d('2026-09-01'),
    terminationDate: null,
    userId: null,
  };
  it.each([
    [{}, '2026-10-16', null],
    [{ status: 'ON_LEAVE' }, '2026-10-16', 'NOT_ACTIVE'],
    [{ status: 'TERMINATED' }, '2026-10-16', 'TERMINATED'],
    [{}, '2026-08-31', 'NOT_HIRED_YET'],
  ] as const)('%o el %s → %s', (over, date, expected) => {
    expect(unavailabilityReason({ ...emp, ...over }, d(date))).toBe(expected);
  });
});

describe('ventana de marcación', () => {
  it('turno 14:00 con 5 min de anticipación abre a las 13:55', () => {
    const w = clockWindow(shift);
    expect(w.clockInOpensAt.toISOString()).toBe('2026-10-16T18:55:00.000Z');
    expect(w.lateAfter.toISOString()).toBe('2026-10-16T19:05:00.000Z');
    expect(w.clockOutClosesAt.toISOString()).toBe('2026-10-17T07:00:00.000Z');
  });

  it.each([
    ['13:54', false, 'TOO_EARLY', 0],
    ['13:55', true, null, 0],
    ['14:05', true, null, 0], // dentro de la tolerancia
    ['14:06', true, null, 6], // tarde: cuenta desde las 14:00
    ['22:00', false, 'SHIFT_ENDED', 0],
  ] as const)('marcar entrada a las %s', (time, allowed, rejection, late) => {
    const [h, m] = time.split(':').map(Number);
    const now = new Date(Date.UTC(2026, 9, 16, h + 5, m)); // hora Bogotá → UTC
    const r = evaluateClockIn(shift, now);
    expect([r.allowed, r.rejection, r.lateMinutes]).toEqual([
      allowed,
      rejection,
      late,
    ]);
  });

  it('un turno cancelado no permite marcar', () => {
    expect(
      evaluateClockIn({ ...shift, status: 'CANCELLED' }, shift.startsAt)
        .rejection,
    ).toBe('SHIFT_CANCELLED');
  });
});
