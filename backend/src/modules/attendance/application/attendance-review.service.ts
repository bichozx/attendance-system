import { Injectable } from '@nestjs/common';
import { Actor, AuditLog } from '../../../shared/application/audit-log';
import { Notifier } from '../../../shared/application/notifier';
import { utcToLocal } from '../../../shared/domain/zoned-time';
import { clockWindow } from '../../shifts/domain/shift.rules';
import {
  AttendanceNotInProgressError,
  InvalidAdjustmentError,
} from '../domain/attendance.errors';
import { AttendanceRepository } from '../domain/attendance.repository';
import { computeWorkMetrics, lateMinutesFor } from '../domain/attendance.rules';
import type { AttendanceStatus, WorkMetrics } from '../domain/attendance.types';
import { AttendanceQueriesService } from './attendance-queries.service';

const HOUR = 3_600_000;
/** Un ajuste debe caer razonablemente cerca del turno. */
const ADJUSTMENT_MARGIN_HOURS = 12;

export interface AdjustmentInput {
  clockInAt?: Date | null;
  clockOutAt?: Date | null;
  reason: string;
}

@Injectable()
export class AttendanceReviewService {
  constructor(
    private readonly repo: AttendanceRepository,
    private readonly queries: AttendanceQueriesService,
    private readonly audit: AuditLog,
    private readonly notifier: Notifier,
  ) {}

  /**
   * El administrador termina la jornada de quien está trabajando (ej. lo envía a casa
   * temprano). Es un ajuste con salida = AHORA según el servidor: queda el evento
   * MANUAL_ADJUSTMENT con el motivo, se recalculan los minutos y se avisa al empleado.
   */
  async endShift(actor: Actor, id: string, reason: string) {
    const current = await this.queries.detail(actor.companyId, id);
    if (!current.clockInAt || current.clockOutAt)
      throw new AttendanceNotInProgressError();

    const clockOutAt = new Date();
    const detail = await this.adjust(actor, id, {
      clockOutAt,
      reason: `Jornada terminada por el administrador: ${reason}`,
    });

    const userId = await this.repo.findEmployeeUserId(
      actor.companyId,
      current.employee.id,
    );
    if (userId) {
      const at = utcToLocal(clockOutAt, current.shift.timeZone).time;
      await this.notifier.notify([
        {
          companyId: actor.companyId,
          userId,
          type: 'SHIFT_CHANGED',
          title: 'Tu jornada fue terminada',
          body: `El administrador registró tu salida a las ${at}. Motivo: ${reason}`,
          data: { attendanceId: id },
        },
      ]);
    }
    return detail;
  }

  /**
   * Corrección manual (olvido de marcación, falla de la app...). No borra nada:
   * se registra un evento MANUAL_ADJUSTMENT con el antes, el después y el motivo.
   */
  async adjust(actor: Actor, id: string, input: AdjustmentInput) {
    const current = await this.queries.detail(actor.companyId, id);
    const shift = current.shift;
    const clockInAt =
      input.clockInAt === undefined ? current.clockInAt : input.clockInAt;
    const clockOutAt =
      input.clockOutAt === undefined ? current.clockOutAt : input.clockOutAt;

    const now = new Date();
    const min = shift.startsAt.getTime() - ADJUSTMENT_MARGIN_HOURS * HOUR;
    const max = shift.endsAt.getTime() + ADJUSTMENT_MARGIN_HOURS * HOUR;
    for (const [label, value] of [
      ['clockInAt', clockInAt],
      ['clockOutAt', clockOutAt],
    ] as const) {
      if (!value) continue;
      if (value > now)
        throw new InvalidAdjustmentError(
          `${label} no puede estar en el futuro`,
        );
      if (value.getTime() < min || value.getTime() > max) {
        throw new InvalidAdjustmentError(
          `${label} debe estar a menos de ${ADJUSTMENT_MARGIN_HOURS} h del turno`,
        );
      }
    }
    if (clockOutAt && !clockInAt) {
      throw new InvalidAdjustmentError('No puede haber salida sin entrada');
    }
    if (clockInAt && clockOutAt && clockOutAt <= clockInAt) {
      throw new InvalidAdjustmentError(
        'La salida debe ser posterior a la entrada',
      );
    }

    const empty: WorkMetrics = {
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      workedMinutes: 0,
      overtimeMinutes: 0,
    };
    let status: AttendanceStatus;
    let metrics = empty;
    if (clockInAt && clockOutAt) {
      status = 'COMPLETED';
      metrics = computeWorkMetrics(shift, clockInAt, clockOutAt);
    } else if (clockInAt) {
      status =
        now > clockWindow(shift).clockOutClosesAt
          ? 'INCOMPLETE'
          : 'IN_PROGRESS';
      metrics = { ...empty, lateMinutes: lateMinutesFor(shift, clockInAt) };
    } else {
      status = 'ABSENT';
    }

    const before = {
      clockInAt: current.clockInAt,
      clockOutAt: current.clockOutAt,
      status: current.status,
    };
    await this.repo.applyAdjustment(actor.companyId, id, {
      status,
      clockInAt,
      clockOutAt,
      metrics,
      actorUserId: actor.userId,
      reason: input.reason,
      before,
    });
    await this.audit.record({
      companyId: actor.companyId,
      actorUserId: actor.userId,
      action: 'attendance.adjusted',
      entityType: 'Attendance',
      entityId: id,
      before,
      after: {
        clockInAt,
        clockOutAt,
        status,
        ...metrics,
        reason: input.reason,
      },
    });
    return this.queries.detail(actor.companyId, id);
  }

  /** El supervisor revisó y da por buena la asistencia tal como está. */
  async markReviewed(actor: Actor, id: string, notes: string | null) {
    const current = await this.queries.detail(actor.companyId, id);
    await this.repo.markReviewed(actor.companyId, id, actor.userId);
    await this.audit.record({
      companyId: actor.companyId,
      actorUserId: actor.userId,
      action: 'attendance.reviewed',
      entityType: 'Attendance',
      entityId: id,
      before: {
        needsReview: current.needsReview,
        reviewReasons: current.reviewReasons,
      },
      after: { needsReview: false, notes },
    });
    return this.queries.detail(actor.companyId, id);
  }
}
