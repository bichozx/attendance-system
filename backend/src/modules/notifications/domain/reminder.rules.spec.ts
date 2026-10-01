import {
  dueReminders,
  MAX_PUSH_ATTEMPTS,
  nextRetryAt,
  ReminderCandidate,
} from './reminder.rules';

/** Turno 14:00–22:00 hora Bogotá. */
const bog = (hhmm: string, plusDay = 0) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(2026, 9, 16 + plusDay, h + 5, m));
};
const c = (over: Partial<ReminderCandidate> = {}): ReminderCandidate => ({
  assignmentId: 'a1',
  shiftId: 's1',
  companyId: 'c1',
  userId: 'u1',
  storeName: 'Tienda Centro',
  timeZone: 'America/Bogota',
  startsAt: bog('14:00'),
  endsAt: bog('22:00'),
  lateToleranceMinutes: 5,
  clockInAt: null,
  attendanceStatus: null,
  ...over,
});
const types = (now: Date, over?: Partial<ReminderCandidate>) =>
  dueReminders([c(over)], now).map((r) => r.type);

describe('dueReminders', () => {
  it('5 minutos antes: "tu turno empieza pronto" con la hora local', () => {
    const [r] = dueReminders([c()], bog('13:56'));
    expect(r.type).toBe('SHIFT_REMINDER');
    expect(r.body).toBe(
      'A las 14:00 en Tienda Centro. Ya puedes marcar tu entrada.',
    );
    expect(r.dedupeKey).toBe('shift-reminder:a1');
  });

  it('nada antes de la ventana ni si ya marcó', () => {
    expect(types(bog('13:50'))).toEqual([]);
    expect(types(bog('13:57'), { clockInAt: bog('13:56') })).toEqual([]);
  });

  it('entrada no registrada a los 10 minutos del inicio', () => {
    expect(types(bog('14:09'))).toEqual([]);
    expect(types(bog('14:10'))).toEqual(['MISSING_CLOCK_IN']);
  });

  it('si la tolerancia es mayor, espera a que termine', () => {
    expect(types(bog('14:12'), { lateToleranceMinutes: 15 })).toEqual([]);
    expect(types(bog('14:16'), { lateToleranceMinutes: 15 })).toEqual([
      'MISSING_CLOCK_IN',
    ]);
  });

  it('recordatorio de salida solo con la jornada abierta y dentro de la hora siguiente', () => {
    expect(
      types(bog('22:05'), {
        clockInAt: bog('14:00'),
        attendanceStatus: 'IN_PROGRESS',
      }),
    ).toEqual(['CLOCK_OUT_REMINDER']);
    expect(
      types(bog('22:05'), {
        clockInAt: bog('14:00'),
        attendanceStatus: 'COMPLETED',
      }),
    ).toEqual([]);
    expect(
      types(bog('23:30'), {
        clockInAt: bog('14:00'),
        attendanceStatus: 'IN_PROGRESS',
      }),
    ).toEqual([]);
  });

  it('turno nocturno: la salida es al día siguiente', () => {
    const night = {
      startsAt: bog('22:00'),
      endsAt: bog('06:00', 1),
      clockInAt: bog('21:58'),
      attendanceStatus: 'IN_PROGRESS',
    };
    expect(types(bog('06:10', 1), night)).toEqual(['CLOCK_OUT_REMINDER']);
  });
});

describe('nextRetryAt', () => {
  const now = new Date('2026-10-16T12:00:00Z');
  it('reintenta con espera creciente y luego se rinde', () => {
    expect(nextRetryAt(1, now)?.toISOString()).toBe('2026-10-16T12:01:00.000Z');
    expect(nextRetryAt(2, now)?.toISOString()).toBe('2026-10-16T12:05:00.000Z');
    expect(nextRetryAt(4, now)?.toISOString()).toBe('2026-10-16T13:00:00.000Z');
    expect(nextRetryAt(MAX_PUSH_ATTEMPTS, now)).toBeNull();
  });
});
