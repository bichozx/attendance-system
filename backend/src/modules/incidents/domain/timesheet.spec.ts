import { localToUtc } from '../../../shared/domain/zoned-time';
import {
  buildTimesheet,
  TimesheetAttendance,
  TimesheetIncident,
} from './timesheet';

const TZ = 'America/Bogota';
const t = (date: string, time: string) => localToUtc(date, time, TZ);
const emp = { id: 'e1', code: 'EMP-1', firstName: 'Carlos', lastName: 'Pérez' };

const att = (
  id: string,
  date: string,
  over: Partial<TimesheetAttendance> = {},
): TimesheetAttendance => ({
  id,
  employeeId: 'e1',
  status: 'COMPLETED',
  shiftStartsAt: t(date, '14:00'),
  shiftEndsAt: t(date, '22:00'),
  scheduledWorkMinutes: 420,
  clockInAt: t(date, '14:00'),
  workedMinutes: 420,
  lateMinutes: 0,
  earlyLeaveMinutes: 0,
  overtimeMinutes: 0,
  needsReview: false,
  ...over,
});

const inc = (over: Partial<TimesheetIncident>): TimesheetIncident => ({
  employeeId: 'e1',
  type: 'OTHER',
  status: 'APPROVED',
  attendanceId: null,
  startsAt: t('2026-10-01', '00:00'),
  endsAt: null,
  minutes: null,
  ...over,
});

const run = (
  attendances: TimesheetAttendance[],
  incidents: TimesheetIncident[] = [],
) =>
  buildTimesheet({
    employees: [emp],
    attendances,
    incidents,
    from: '2026-10-01',
    to: '2026-10-15',
    timeZone: TZ,
  })[0];

describe('buildTimesheet', () => {
  it('suma minutos programados y trabajados', () => {
    const r = run([
      att('a1', '2026-10-01'),
      att('a2', '2026-10-02', { workedMinutes: 400 }),
    ]);
    expect([r.shifts, r.scheduledMinutes, r.workedMinutes]).toEqual([
      2, 840, 820,
    ]);
  });

  it('tardanza: justifica solo los minutos aprobados', () => {
    const r = run(
      [
        att('a1', '2026-10-01', {
          lateMinutes: 20,
          clockInAt: t('2026-10-01', '14:20'),
        }),
      ],
      [inc({ type: 'LATE_ARRIVAL', attendanceId: 'a1', minutes: 15 })],
    );
    expect(r.late).toEqual({ total: 20, excused: 15, unexcused: 5 });
  });

  it('una tardanza pendiente no cuenta como justificada', () => {
    const r = run(
      [
        att('a1', '2026-10-01', {
          lateMinutes: 20,
          clockInAt: t('2026-10-01', '14:20'),
        }),
      ],
      [
        inc({
          type: 'LATE_ARRIVAL',
          attendanceId: 'a1',
          minutes: 20,
          status: 'PENDING',
        }),
      ],
    );
    expect(r.late.unexcused).toBe(20);
  });

  it('un permiso que cubre el inicio del turno justifica la tardanza completa', () => {
    const r = run(
      [
        att('a1', '2026-10-01', {
          lateMinutes: 90,
          clockInAt: t('2026-10-01', '15:30'),
        }),
      ],
      [
        inc({
          type: 'PERMISSION',
          startsAt: t('2026-10-01', '13:00'),
          endsAt: t('2026-10-01', '15:30'),
        }),
      ],
    );
    expect(r.late).toEqual({ total: 90, excused: 90, unexcused: 0 });
    expect(r.permissionMinutes).toBe(150);
  });

  it('horas extra: aprobadas, pendientes y sin aprobar', () => {
    const r = run(
      [
        att('a1', '2026-10-01', { overtimeMinutes: 60 }),
        att('a2', '2026-10-02', { overtimeMinutes: 30 }),
      ],
      [
        inc({ type: 'OVERTIME', attendanceId: 'a1', minutes: 45 }),
        inc({
          type: 'OVERTIME',
          attendanceId: 'a2',
          minutes: 30,
          status: 'PENDING',
        }),
      ],
    );
    expect(r.overtime).toEqual({
      recorded: 90,
      approved: 45,
      pending: 30,
      unapproved: 45,
    });
  });

  it('ausencias: justificadas por incapacidad o por novedad ABSENCE', () => {
    const r = run(
      [
        att('a1', '2026-10-03', {
          status: 'ABSENT',
          workedMinutes: 0,
          clockInAt: null,
        }),
        att('a2', '2026-10-04', {
          status: 'ABSENT',
          workedMinutes: 0,
          clockInAt: null,
        }),
        att('a3', '2026-10-06', {
          status: 'ABSENT',
          workedMinutes: 0,
          clockInAt: null,
        }),
        att('a4', '2026-10-07', {
          status: 'ABSENT',
          workedMinutes: 0,
          clockInAt: null,
        }),
      ],
      [
        inc({
          type: 'SICK_LEAVE',
          startsAt: t('2026-10-03', '00:00'),
          endsAt: t('2026-10-05', '00:00'),
        }),
        inc({ type: 'ABSENCE', attendanceId: 'a3' }),
      ],
    );
    expect(r.absences).toEqual({ total: 4, justified: 3, unjustified: 1 });
    expect(r.sickLeaveDays).toBe(2);
  });

  it('la incapacidad solo cuenta los días dentro del rango consultado', () => {
    const r = run(
      [],
      [
        inc({
          type: 'SICK_LEAVE',
          startsAt: t('2026-09-28', '00:00'),
          endsAt: t('2026-10-04', '00:00'),
        }),
      ],
    );
    expect(r.sickLeaveDays).toBe(3); // 1, 2 y 3 de octubre
  });
});
