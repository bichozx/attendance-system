import type {
  ShiftChangeView,
  ShiftRef,
} from '../domain/shift-change.repository';
import { stageOf } from '../domain/shift-change.rules';
import { describeShift } from '../application/shift-time';
import type {
  ChangeShiftDto,
  ShiftChangeResponseDto,
} from './dto/shift-change.dto';

export const ShiftChangePresenter = {
  shift(s: ShiftRef): ChangeShiftDto {
    return {
      shiftId: s.shiftId,
      startsAt: s.startsAt,
      endsAt: s.endsAt,
      description: describeShift(s.startsAt, s.endsAt, s.timeZone),
      storeName: s.storeName,
    };
  },

  view(v: ShiftChangeView): ShiftChangeResponseDto {
    const person = ({
      employeeId,
      firstName,
      lastName,
    }: ShiftChangeView['peer']) => ({
      employeeId,
      firstName,
      lastName,
    });
    return {
      id: v.id,
      kind: v.kind,
      stage: stageOf(v.state),
      requester: person(v.requester),
      peer: person(v.peer),
      shift: ShiftChangePresenter.shift(v.shift),
      peerShift: v.peerShift ? ShiftChangePresenter.shift(v.peerShift) : null,
      reason: v.reason,
      reviewNotes: v.reviewNotes,
      peerRespondedAt: v.peerRespondedAt,
      reviewedAt: v.reviewedAt,
      createdAt: v.createdAt,
    };
  },
};
