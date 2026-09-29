import { formatDateOnly } from '../../../shared/domain/date-only';
import { toLocalShiftTime } from '../../shifts/application/shift-time';
import type {
  AttendanceDetail,
  AttendanceListItem,
} from '../domain/attendance.repository';
import type { ShiftForClock } from '../domain/attendance.types';
import type {
  AttendanceDetailResponseDto,
  AttendanceEventDto,
  AttendanceResponseDto,
  ShiftSummaryDto,
} from './dto/attendance.dto';

export const AttendancePresenter = {
  shift(s: ShiftForClock): ShiftSummaryDto {
    const local = toLocalShiftTime(s.startsAt, s.endsAt, s.timeZone);
    return {
      shiftId: s.shiftId,
      storeId: s.storeId,
      storeName: s.storeName,
      timeZone: s.timeZone,
      startsAt: s.startsAt,
      endsAt: s.endsAt,
      localDate: local.date,
      localStart: local.startTime,
      localEnd: local.endTime,
      status: s.status,
    };
  },

  item(a: AttendanceListItem): AttendanceResponseDto {
    return {
      id: a.id,
      workDate: formatDateOnly(a.workDate),
      status: a.status,
      employee: a.employee,
      shift: AttendancePresenter.shift(a.shift),
      clockInAt: a.clockInAt,
      clockOutAt: a.clockOutAt,
      lateMinutes: a.lateMinutes,
      earlyLeaveMinutes: a.earlyLeaveMinutes,
      workedMinutes: a.workedMinutes,
      overtimeMinutes: a.overtimeMinutes,
      needsReview: a.needsReview,
      reviewReasons: a.reviewReasons,
      reviewedAt: a.reviewedAt,
    };
  },

  detail(a: AttendanceDetail): AttendanceDetailResponseDto {
    return {
      ...AttendancePresenter.item(a),
      events: a.events.map((e): AttendanceEventDto => ({
        id: e.id,
        type: e.type,
        result: e.result,
        rejectionReason: e.rejectionReason,
        source: e.source,
        serverTimestamp: e.serverTimestamp,
        clientTimestamp: e.clientTimestamp,
        receivedAt: e.receivedAt,
        clockDriftSeconds: e.clockDriftSeconds,
        latitude: e.latitude,
        longitude: e.longitude,
        accuracyMeters: e.accuracyMeters,
        distanceMeters: e.distanceMeters,
        withinGeofence: e.withinGeofence,
        deviceInfo: (e.deviceInfo as Record<string, unknown> | null) ?? null,
        createdById: e.createdById,
      })),
    };
  },
};
