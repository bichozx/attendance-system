import { Injectable } from '@nestjs/common';
import type { Actor } from '../../../shared/application/audit-log';
import { PageRequest, toPage } from '../../../shared/application/page';
import { parseDateOnly } from '../../../shared/domain/date-only';
import { clockWindow } from '../../shifts/domain/shift.rules';
import {
  AttendanceNotFoundError,
  NotAnEmployeeError,
} from '../domain/attendance.errors';
import {
  AttendanceFilter,
  AttendanceRepository,
} from '../domain/attendance.repository';
import { selectShiftForClockIn } from '../domain/attendance.rules';

@Injectable()
export class AttendanceQueriesService {
  constructor(private readonly repo: AttendanceRepository) {}

  /**
   * Pantalla principal de la app: ¿tengo una jornada abierta? ¿cuál es mi próximo
   * turno y ya puedo marcar? Incluye la hora del servidor para que la app no
   * dependa del reloj del teléfono.
   */
  async myStatus(actor: Actor) {
    const employee = await this.repo.findEmployeeByUser(
      actor.companyId,
      actor.userId,
    );
    if (!employee) throw new NotAnEmployeeError();

    const now = new Date();
    const reader = this.repo.reader(actor.companyId);
    const [open, shifts] = await Promise.all([
      reader.findOpenAttendance(employee.id),
      reader.findShiftsAround(employee.id, now),
    ]);

    const selection = selectShiftForClockIn(shifts, now);
    const next =
      selection.rejection === null ||
      selection.rejection === 'TOO_EARLY' ||
      selection.rejection === 'SHIFT_CANCELLED'
        ? selection.shift
        : null;

    return {
      serverTime: now,
      employee: {
        id: employee.id,
        firstName: employee.firstName,
        lastName: employee.lastName,
        status: employee.status,
      },
      openAttendance: open
        ? {
            attendanceId: open.attendance.id,
            clockInAt: open.attendance.clockInAt,
            lateMinutes: open.attendance.lateMinutes,
            shift: open.shift,
            clockOutClosesAt: clockWindow(open.shift).clockOutClosesAt,
          }
        : null,
      nextShift: next
        ? {
            shift: next,
            window: clockWindow(next),
            canClockIn:
              selection.rejection === null && employee.status === 'ACTIVE',
            reason:
              employee.status !== 'ACTIVE'
                ? 'EMPLOYEE_NOT_ACTIVE'
                : selection.rejection,
          }
        : null,
    };
  }

  async myHistory(actor: Actor, from: string, to: string, page: PageRequest) {
    const employee = await this.repo.findEmployeeByUser(
      actor.companyId,
      actor.userId,
    );
    if (!employee) throw new NotAnEmployeeError();
    return this.list(
      actor.companyId,
      {
        from: parseDateOnly(from),
        to: parseDateOnly(to),
        employeeId: employee.id,
      },
      page,
    );
  }

  async list(companyId: string, filter: AttendanceFilter, page: PageRequest) {
    const { items, total } = await this.repo.list(companyId, filter, page);
    return toPage(items, total, page);
  }

  async detail(companyId: string, id: string) {
    const detail = await this.repo.findDetail(companyId, id);
    if (!detail) throw new AttendanceNotFoundError();
    return detail;
  }
}
