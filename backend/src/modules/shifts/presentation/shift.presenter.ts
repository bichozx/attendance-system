import { formatDateOnly } from '../../../shared/domain/date-only';
import { toLocalShiftTime } from '../application/shift-time';
import {
  clockWindow,
  durationMinutes,
  scheduledWorkMinutes,
} from '../domain/shift.rules';
import type { PeriodView, ShiftView } from '../domain/shift.types';
import type {
  MyShiftResponseDto,
  PeriodResponseDto,
  ShiftResponseDto,
} from './dto/shift.dto';

function local(s: ShiftView) {
  const t = toLocalShiftTime(s.startsAt, s.endsAt, s.timeZone);
  return { ...t, overnight: t.endTime <= t.startTime };
}

export const ShiftPresenter = {
  period(p: PeriodView): PeriodResponseDto {
    return {
      ...p,
      startDate: formatDateOnly(p.startDate),
      endDate: formatDateOnly(p.endDate),
    };
  },

  shift(s: ShiftView): ShiftResponseDto {
    return {
      ...s,
      local: local(s),
      durationMinutes: durationMinutes(s),
      scheduledWorkMinutes: scheduledWorkMinutes(s),
      clockWindow: clockWindow(s),
    };
  },

  /** Vista del empleado: solo su propia asignación, sin datos de compañeros. */
  myShift(s: ShiftView, employeeId: string): MyShiftResponseDto {
    const mine = s.assignments.find((a) => a.employeeId === employeeId);
    return {
      id: s.id,
      storeId: s.storeId,
      storeName: s.storeName,
      timeZone: s.timeZone,
      status: s.status,
      myAssignmentStatus: mine?.status ?? 'CANCELLED',
      notes: s.notes,
      startsAt: s.startsAt,
      endsAt: s.endsAt,
      local: local(s),
      scheduledWorkMinutes: scheduledWorkMinutes(s),
      breakMinutes: s.breakMinutes,
      clockWindow: clockWindow(s),
    };
  },
};
