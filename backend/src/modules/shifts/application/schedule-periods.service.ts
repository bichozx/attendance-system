import { Injectable } from '@nestjs/common';
import { Actor, AuditLog } from '../../../shared/application/audit-log';
import { Notifier } from '../../../shared/application/notifier';
import { PageRequest, toPage } from '../../../shared/application/page';
import {
  formatDateOnly,
  parseDateOnly,
} from '../../../shared/domain/date-only';
import { todayIn } from '../../../shared/domain/zoned-time';
import { StoreNotFoundError } from '../../stores/domain/store.errors';
import {
  PeriodNotFoundError,
  PeriodOverlapError,
  PeriodStatusError,
} from '../domain/shift.errors';
import {
  SchedulePeriodRepository,
  ShiftRepository,
} from '../domain/shift.repository';
import { assertPeriodDates } from '../domain/shift.rules';
import type {
  NewPeriod,
  PeriodFilter,
  PeriodView,
} from '../domain/shift.types';

export interface PeriodInput {
  storeId: string | null;
  name?: string;
  startDate: string;
  endDate: string;
}

@Injectable()
export class SchedulePeriodsService {
  constructor(
    private readonly periods: SchedulePeriodRepository,
    private readonly shifts: ShiftRepository,
    private readonly notifier: Notifier,
    private readonly audit: AuditLog,
  ) {}

  async list(companyId: string, filter: PeriodFilter, page: PageRequest) {
    const { items, total } = await this.periods.list(companyId, filter, page);
    return toPage(items, total, page);
  }

  async get(companyId: string, id: string): Promise<PeriodView> {
    const period = await this.periods.findById(companyId, id);
    if (!period) throw new PeriodNotFoundError();
    return period;
  }

  async create(actor: Actor, input: PeriodInput): Promise<PeriodView> {
    if (
      input.storeId &&
      !(await this.shifts.findSchedulingStore(actor.companyId, input.storeId))
    ) {
      throw new StoreNotFoundError();
    }
    const data: NewPeriod = {
      storeId: input.storeId,
      startDate: parseDateOnly(input.startDate),
      endDate: parseDateOnly(input.endDate),
      name: input.name ?? defaultName(input.startDate, input.endDate),
    };
    await this.assertValidRange(actor.companyId, data);

    const period = await this.periods.create(actor.companyId, data);
    await this.record(
      actor,
      period.id,
      'schedule_period.created',
      undefined,
      period,
    );
    return period;
  }

  async update(
    actor: Actor,
    id: string,
    input: { name?: string; startDate?: string; endDate?: string },
  ) {
    const before = await this.get(actor.companyId, id);
    if (before.status === 'CLOSED') {
      throw new PeriodStatusError('El periodo está cerrado');
    }

    const changes: Partial<NewPeriod> = { name: input.name };
    if (input.startDate || input.endDate) {
      const hasShifts =
        (await this.periods.countActiveShifts(actor.companyId, id)) > 0;
      if (before.status !== 'DRAFT' || hasShifts) {
        throw new PeriodStatusError(
          'Las fechas solo se pueden cambiar en un borrador que aún no tiene turnos',
        );
      }
      changes.startDate = input.startDate
        ? parseDateOnly(input.startDate)
        : before.startDate;
      changes.endDate = input.endDate
        ? parseDateOnly(input.endDate)
        : before.endDate;
      await this.assertValidRange(
        actor.companyId,
        { ...before, ...changes } as NewPeriod,
        id,
      );
    }

    const after = await this.periods.update(actor.companyId, id, changes);
    await this.record(actor, id, 'schedule_period.updated', before, after);
    return after;
  }

  /** Borrador → publicado. Notifica a cada empleado con turnos en el periodo. */
  async publish(actor: Actor, id: string): Promise<PeriodView> {
    const before = await this.get(actor.companyId, id);
    if (before.status !== 'DRAFT') {
      throw new PeriodStatusError(
        'Solo se pueden publicar periodos en borrador',
      );
    }
    if ((await this.periods.countActiveShifts(actor.companyId, id)) === 0) {
      throw new PeriodStatusError('El periodo no tiene turnos para publicar');
    }

    const after = await this.periods.setStatus(
      actor.companyId,
      id,
      'PUBLISHED',
      actor.userId,
    );
    const userIds = await this.periods.findAssignedUserIds(actor.companyId, id);
    await this.notifier.notify(
      userIds.map((userId) => ({
        companyId: actor.companyId,
        userId,
        type: 'SCHEDULE_PUBLISHED' as const,
        title: 'Nueva programación publicada',
        body: `Ya puedes ver tus turnos del periodo "${after.name}".`,
        data: { schedulePeriodId: id },
      })),
    );
    await this.record(
      actor,
      id,
      'schedule_period.published',
      { status: before.status },
      {
        status: after.status,
        notifiedUsers: userIds.length,
      },
    );
    return after;
  }

  /** Publicado → cerrado, cuando ya terminó. Un periodo cerrado queda congelado. */
  async close(actor: Actor, id: string): Promise<PeriodView> {
    const before = await this.get(actor.companyId, id);
    if (before.status !== 'PUBLISHED') {
      throw new PeriodStatusError('Solo se pueden cerrar periodos publicados');
    }
    const timeZone = before.storeId
      ? (await this.shifts.findSchedulingStore(
          actor.companyId,
          before.storeId,
        ))!.timeZone
      : await this.periods.companyTimeZone(actor.companyId);
    if (formatDateOnly(before.endDate) >= todayIn(timeZone)) {
      throw new PeriodStatusError('El periodo aún no ha terminado');
    }

    const after = await this.periods.setStatus(
      actor.companyId,
      id,
      'CLOSED',
      actor.userId,
    );
    await this.record(
      actor,
      id,
      'schedule_period.closed',
      { status: before.status },
      {
        status: after.status,
      },
    );
    return after;
  }

  /** Solo borradores: nadie ha visto esos turnos todavía. */
  async delete(actor: Actor, id: string): Promise<void> {
    const period = await this.get(actor.companyId, id);
    if (period.status !== 'DRAFT') {
      throw new PeriodStatusError(
        'Solo se pueden eliminar periodos en borrador',
      );
    }
    await this.periods.deleteWithShifts(actor.companyId, id);
    await this.record(actor, id, 'schedule_period.deleted', period, undefined);
  }

  private async assertValidRange(
    companyId: string,
    data: NewPeriod,
    excludeId?: string,
  ) {
    assertPeriodDates(data.startDate, data.endDate);
    const overlapping = await this.periods.findOverlapping(
      companyId,
      data,
      excludeId,
    );
    if (overlapping) throw new PeriodOverlapError(overlapping);
  }

  private record(
    actor: Actor,
    id: string,
    action: string,
    before: unknown,
    after: unknown,
  ) {
    return this.audit.record({
      companyId: actor.companyId,
      actorUserId: actor.userId,
      action,
      entityType: 'SchedulePeriod',
      entityId: id,
      before,
      after,
    });
  }
}

const MONTHS = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];

/** "Quincena 1–15 oct 2026" o "Periodo 25 oct – 7 nov 2026" */
function defaultName(start: string, end: string): string {
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  if (sy === ey && sm === em)
    return `Quincena ${sd}–${ed} ${MONTHS[em - 1]} ${ey}`;
  const from = `${sd} ${MONTHS[sm - 1]}${sy !== ey ? ` ${sy}` : ''}`;
  return `Periodo ${from} – ${ed} ${MONTHS[em - 1]} ${ey}`;
}
