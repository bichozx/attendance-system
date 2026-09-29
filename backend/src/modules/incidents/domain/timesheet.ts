import { addDays, localToUtc } from '../../../shared/domain/zoned-time';

/**
 * Consolidado para nómina. Nunca modifica la asistencia registrada:
 * cruza lo registrado con las novedades para separar lo justificado de lo que no.
 */

export interface TimesheetEmployee {
  id: string;
  code: string;
  firstName: string;
  lastName: string;
}

export interface TimesheetAttendance {
  id: string;
  employeeId: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'INCOMPLETE' | 'ABSENT';
  shiftStartsAt: Date;
  shiftEndsAt: Date;
  scheduledWorkMinutes: number;
  clockInAt: Date | null;
  workedMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
  needsReview: boolean;
}

export interface TimesheetIncident {
  employeeId: string;
  type: string;
  status: 'APPROVED' | 'PENDING';
  attendanceId: string | null;
  startsAt: Date;
  endsAt: Date | null;
  minutes: number | null;
}

export interface Split {
  total: number;
  excused: number;
  unexcused: number;
}

export interface TimesheetRow {
  employee: TimesheetEmployee;
  shifts: number;
  scheduledMinutes: number;
  workedMinutes: number;
  late: Split;
  earlyLeave: Split;
  overtime: {
    recorded: number;
    approved: number;
    pending: number;
    unapproved: number;
  };
  absences: { total: number; justified: number; unjustified: number };
  /** Jornadas sin salida aún sin resolver. */
  incomplete: number;
  pendingReview: number;
  sickLeaveDays: number;
  permissionMinutes: number;
}

const MINUTE = 60_000;
const overlaps = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) =>
  aStart < bEnd && bStart < aEnd;
const sum = (items: TimesheetIncident[]) =>
  items.reduce((acc, i) => acc + (i.minutes ?? 0), 0);

export function buildTimesheet(input: {
  employees: TimesheetEmployee[];
  attendances: TimesheetAttendance[];
  incidents: TimesheetIncident[];
  /** Fechas locales inclusivas y zona horaria de la empresa. */
  from: string;
  to: string;
  timeZone: string;
}): TimesheetRow[] {
  const rangeStart = localToUtc(input.from, '00:00', input.timeZone);
  const rangeEnd = localToUtc(addDays(input.to, 1), '00:00', input.timeZone);

  return input.employees.map((employee) => {
    const attendances = input.attendances.filter(
      (a) => a.employeeId === employee.id,
    );
    const incidents = input.incidents.filter(
      (i) => i.employeeId === employee.id,
    );
    const approved = incidents.filter((i) => i.status === 'APPROVED');
    const timeOff = approved.filter(
      (i) => (i.type === 'SICK_LEAVE' || i.type === 'PERMISSION') && i.endsAt,
    );

    const row: TimesheetRow = {
      employee,
      shifts: attendances.length,
      scheduledMinutes: 0,
      workedMinutes: 0,
      late: { total: 0, excused: 0, unexcused: 0 },
      earlyLeave: { total: 0, excused: 0, unexcused: 0 },
      overtime: { recorded: 0, approved: 0, pending: 0, unapproved: 0 },
      absences: { total: 0, justified: 0, unjustified: 0 },
      incomplete: 0,
      pendingReview: 0,
      sickLeaveDays: 0,
      permissionMinutes: 0,
    };

    for (const a of attendances) {
      const linked = (
        type: string,
        status: 'APPROVED' | 'PENDING' = 'APPROVED',
      ) =>
        incidents.filter(
          (i) =>
            i.attendanceId === a.id && i.type === type && i.status === status,
        );
      const covering = (start: Date, end: Date) =>
        timeOff.some((t) => t.startsAt <= start && t.endsAt! >= end);

      row.scheduledMinutes += a.scheduledWorkMinutes;
      row.workedMinutes += a.workedMinutes;
      if (a.status === 'INCOMPLETE') row.incomplete++;
      if (a.needsReview) row.pendingReview++;

      // Tardanza: justificada con LATE_ARRIVAL o con un permiso que cubra el inicio
      if (a.lateMinutes > 0) {
        const byPermission =
          a.clockInAt && covering(a.shiftStartsAt, a.clockInAt);
        const excused = byPermission
          ? a.lateMinutes
          : Math.min(a.lateMinutes, sum(linked('LATE_ARRIVAL')));
        addSplit(row.late, a.lateMinutes, excused);
      }

      // Salida anticipada: EARLY_DEPARTURE o permiso que cubra el final
      if (a.earlyLeaveMinutes > 0) {
        const leftAt = new Date(
          a.shiftEndsAt.getTime() - a.earlyLeaveMinutes * MINUTE,
        );
        const excused = covering(leftAt, a.shiftEndsAt)
          ? a.earlyLeaveMinutes
          : Math.min(a.earlyLeaveMinutes, sum(linked('EARLY_DEPARTURE')));
        addSplit(row.earlyLeave, a.earlyLeaveMinutes, excused);
      }

      // Horas extra: solo cuentan las aprobadas; se informan las pendientes
      if (a.overtimeMinutes > 0) {
        const ok = Math.min(a.overtimeMinutes, sum(linked('OVERTIME')));
        const pending = Math.min(
          a.overtimeMinutes - ok,
          sum(linked('OVERTIME', 'PENDING')),
        );
        row.overtime.recorded += a.overtimeMinutes;
        row.overtime.approved += ok;
        row.overtime.pending += pending;
        row.overtime.unapproved += a.overtimeMinutes - ok;
      }

      // Ausencia: justificada con ABSENCE aprobada o con incapacidad/permiso en el turno
      if (a.status === 'ABSENT') {
        row.absences.total++;
        const justified =
          linked('ABSENCE').length > 0 ||
          timeOff.some((t) =>
            overlaps(t.startsAt, t.endsAt!, a.shiftStartsAt, a.shiftEndsAt),
          );
        if (justified) row.absences.justified++;
        else row.absences.unjustified++;
      }
    }

    // Días de incapacidad dentro del rango (días locales que empiezan dentro de la incapacidad)
    const sick = timeOff.filter((t) => t.type === 'SICK_LEAVE');
    for (let day = input.from; day <= input.to; day = addDays(day, 1)) {
      const start = localToUtc(day, '00:00', input.timeZone);
      if (sick.some((t) => start >= t.startsAt && start < t.endsAt!))
        row.sickLeaveDays++;
    }

    // Minutos de permiso dentro del rango
    for (const p of timeOff.filter((t) => t.type === 'PERMISSION')) {
      const start = Math.max(p.startsAt.getTime(), rangeStart.getTime());
      const end = Math.min(p.endsAt!.getTime(), rangeEnd.getTime());
      if (end > start)
        row.permissionMinutes += Math.round((end - start) / MINUTE);
    }

    return row;
  });
}

function addSplit(split: Split, total: number, excused: number) {
  split.total += total;
  split.excused += excused;
  split.unexcused += total - excused;
}
