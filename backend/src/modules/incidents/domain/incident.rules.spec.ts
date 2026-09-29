import { IncidentStatusError, InvalidIncidentError } from './incident.errors';
import {
  nextStatus,
  resolveMinutes,
  resolveMissedClock,
} from './incident.rules';
import type { AttendanceForIncident } from './incident.types';

const at = (iso: string) => new Date(iso);
const attendance: AttendanceForIncident = {
  id: 'a1',
  employeeId: 'e1',
  status: 'COMPLETED',
  clockInAt: at('2026-10-16T19:20:00Z'),
  clockOutAt: at('2026-10-17T03:30:00Z'),
  lateMinutes: 20,
  earlyLeaveMinutes: 0,
  overtimeMinutes: 30,
  shift: {
    startsAt: at('2026-10-16T19:00:00Z'),
    endsAt: at('2026-10-17T03:00:00Z'),
    timeZone: 'America/Bogota',
  },
};

describe('resolveMinutes', () => {
  it('por defecto justifica todo lo registrado', () => {
    expect(resolveMinutes('LATE_ARRIVAL', attendance, undefined)).toBe(20);
  });
  it('permite justificar menos, nunca más de lo registrado', () => {
    expect(resolveMinutes('OVERTIME', attendance, 15)).toBe(15);
    expect(() => resolveMinutes('OVERTIME', attendance, 45)).toThrow(
      InvalidIncidentError,
    );
  });
  it('no se puede justificar un concepto sin minutos registrados', () => {
    expect(() =>
      resolveMinutes('EARLY_DEPARTURE', attendance, undefined),
    ).toThrow(InvalidIncidentError);
  });
  it('los tipos sin minutos los rechazan', () => {
    expect(() => resolveMinutes('SICK_LEAVE', null, 30)).toThrow(
      InvalidIncidentError,
    );
  });
});

describe('resolveMissedClock', () => {
  const incomplete = {
    ...attendance,
    status: 'INCOMPLETE' as const,
    clockOutAt: null,
  };
  it('completa la salida faltante con la entrada registrada', () => {
    const r = resolveMissedClock(incomplete, {
      clockOutAt: at('2026-10-17T03:00:00Z'),
    });
    expect([r.startsAt.toISOString(), r.endsAt.toISOString()]).toEqual([
      '2026-10-16T19:20:00.000Z',
      '2026-10-17T03:00:00.000Z',
    ]);
  });
  it('rechaza salida antes de la entrada o sin datos', () => {
    expect(() =>
      resolveMissedClock(incomplete, {
        clockOutAt: at('2026-10-16T19:00:00Z'),
      }),
    ).toThrow(InvalidIncidentError);
    expect(() => resolveMissedClock(incomplete, {})).toThrow(
      InvalidIncidentError,
    );
  });
});

describe('nextStatus', () => {
  it('pendiente → aprobada / rechazada / cancelada', () => {
    expect(nextStatus('PENDING', 'APPROVE')).toBe('APPROVED');
    expect(nextStatus('PENDING', 'REJECT')).toBe('REJECTED');
    expect(nextStatus('PENDING', 'CANCEL_OWN')).toBe('CANCELLED');
  });
  it('solo una aprobada se puede anular; una rechazada queda cerrada', () => {
    expect(nextStatus('APPROVED', 'REVOKE')).toBe('CANCELLED');
    expect(() => nextStatus('REJECTED', 'APPROVE')).toThrow(
      IncidentStatusError,
    );
    expect(() => nextStatus('APPROVED', 'CANCEL_OWN')).toThrow(
      IncidentStatusError,
    );
  });
});
