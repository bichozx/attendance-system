import { describeShift } from '../../shifts/application/shift-time';
import type { AffectedShift } from '../domain/incident.repository';
import type { IncidentView } from '../domain/incident.types';
import type { AffectedShiftDto, IncidentResponseDto } from './dto/incident.dto';

export const IncidentPresenter = {
  incident({
    employee: { userId: _u, ...employee },
    ...i
  }: IncidentView): IncidentResponseDto {
    return { ...i, employee };
  },
  affected(s: AffectedShift): AffectedShiftDto {
    return {
      shiftId: s.shiftId,
      storeName: s.storeName,
      startsAt: s.startsAt,
      endsAt: s.endsAt,
      description: describeShift(s.startsAt, s.endsAt, s.timeZone),
    };
  },
};
