import { Injectable } from '@nestjs/common';
import { Actor, AuditLog } from '../../../shared/application/audit-log';
import { Notifier } from '../../../shared/application/notifier';
import {
  formatDateOnly,
  parseDateOnly,
} from '../../../shared/domain/date-only';
import { addDays, localToUtc } from '../../../shared/domain/zoned-time';
import { StoreNotFoundError } from '../../stores/domain/store.errors';
import {
  EmployeesNotAvailableError,
  InvalidPeriodDatesError,
  InvalidShiftTimingError,
  PeriodNotFoundError,
  PeriodStatusError,
  ShiftAlreadyStartedError,
  ShiftCancelledError,
  ShiftNotFoundError,
  ShiftOutsidePeriodError,
  ShiftStoreMismatchError,
  StoreInactiveError,
  UnavailableReason,
} from '../domain/shift.errors';
import {
  SchedulePeriodRepository,
  ShiftRepository,
  ShiftToCreate,
} from '../domain/shift.repository';
import { assertShiftTiming, unavailabilityReason } from '../domain/shift.rules';
import type {
  PeriodView,
  SchedulingStore,
  ShiftChangeRecord,
  ShiftFilter,
  ShiftTiming,
  ShiftView,
} from '../domain/shift.types';
import {
  describeShift,
  LocalShiftTime,
  toLocalShiftTime,
  toUtcRange,
} from './shift-time';

export interface ShiftInput extends LocalShiftTime {
  breakMinutes?: number;
  earlyClockInMinutes?: number;
  lateToleranceMinutes?: number;
  notes?: string | null;
  employeeIds?: string[];
}

export interface BatchInput {
  storeId: string;
  schedulePeriodId?: string | null;
  shifts: ShiftInput[];
}

export type ShiftUpdate = Partial<Omit<ShiftInput, 'employeeIds'>>;

const DEFAULTS = {
  breakMinutes: 0,
  earlyClockInMinutes: 5,
  lateToleranceMinutes: 0,
};
const MAX_RANGE_DAYS = 62;

@Injectable()
export class ShiftsService {
  constructor(
    private readonly shifts: ShiftRepository,
    private readonly periods: SchedulePeriodRepository,
    private readonly notifier: Notifier,
    private readonly audit: AuditLog,
  ) {}

  // ------------------------------------------------------------------
  // Consultas
  // ------------------------------------------------------------------

  list(companyId: string, filter: ShiftFilter) {
    return this.shifts.list(companyId, filter);
  }

  /** Convierte fechas locales (zona de la empresa) en un rango UTC [desde 00:00, hasta+1 00:00). */
  async resolveRange(companyId: string, from: string, to: string) {
    if (to < from)
      throw new InvalidPeriodDatesError('"to" es anterior a "from"');
    const days =
      (parseDateOnly(to).getTime() - parseDateOnly(from).getTime()) /
        86_400_000 +
      1;
    if (days > MAX_RANGE_DAYS) {
      throw new InvalidPeriodDatesError(
        `El rango máximo es de ${MAX_RANGE_DAYS} días`,
      );
    }
    const timeZone = await this.periods.companyTimeZone(companyId);
    return {
      from: localToUtc(from, '00:00', timeZone),
      to: localToUtc(addDays(to, 1), '00:00', timeZone),
    };
  }

  async get(companyId: string, id: string): Promise<ShiftView> {
    const shift = await this.shifts.findById(companyId, id);
    if (!shift) throw new ShiftNotFoundError();
    return shift;
  }

  /** Turnos del empleado autenticado. Solo ve periodos publicados. */
  async myShifts(companyId: string, userId: string, from: Date, to: Date) {
    const employeeId = await this.shifts.findEmployeeIdByUser(
      companyId,
      userId,
    );
    if (!employeeId) return { employeeId: null, shifts: [] };
    const shifts = await this.shifts.list(companyId, {
      from,
      to,
      employeeId,
      visibleToEmployees: true,
    });
    return { employeeId, shifts };
  }

  // ------------------------------------------------------------------
  // Creación
  // ------------------------------------------------------------------

  async create(
    actor: Actor,
    storeId: string,
    periodId: string | null,
    input: ShiftInput,
  ) {
    const [id] = await this.createBatch(actor, {
      storeId,
      schedulePeriodId: periodId,
      shifts: [input],
    });
    return this.get(actor.companyId, id);
  }

  /** Crea varios turnos de un mismo establecimiento. Todo o nada. */
  async createBatch(actor: Actor, input: BatchInput): Promise<string[]> {
    const store = await this.requireActiveStore(actor.companyId, input.storeId);
    const period = input.schedulePeriodId
      ? await this.requireOpenPeriod(
          actor.companyId,
          input.schedulePeriodId,
          store.id,
        )
      : null;

    const now = new Date();
    const items: ShiftToCreate[] = input.shifts.map((s) => {
      const timing = this.buildTiming(s, store.timeZone, now, store.defaults);
      if (period) assertWithinPeriod(s.date, period);
      return {
        shift: {
          ...timing,
          storeId: store.id,
          schedulePeriodId: period?.id ?? null,
          notes: s.notes ?? null,
        },
        employeeIds: [...new Set(s.employeeIds ?? [])],
      };
    });

    await this.assertAvailable(
      actor.companyId,
      items.flatMap((item, i) =>
        item.employeeIds.map((employeeId) => ({
          employeeId,
          date: input.shifts[i].date,
          startsAt: item.shift.startsAt,
          endsAt: item.shift.endsAt,
        })),
      ),
    );

    const ids = await this.shifts.createMany(
      actor.companyId,
      items,
      actor.userId,
    );

    if (period?.status === 'PUBLISHED') {
      for (const id of ids) {
        const shift = await this.get(actor.companyId, id);
        await this.announceAssignments(
          actor,
          shift,
          shift.assignments.map((a) => ({
            assignmentId: a.id,
            employeeId: a.employeeId,
          })),
        );
      }
    }
    await this.audit.record({
      companyId: actor.companyId,
      actorUserId: actor.userId,
      action: ids.length === 1 ? 'shift.created' : 'shift.bulk_created',
      entityType: 'Shift',
      entityId: ids.length === 1 ? ids[0] : (period?.id ?? store.id),
      after: {
        shiftIds: ids,
        storeId: store.id,
        schedulePeriodId: period?.id ?? null,
      },
    });
    return ids;
  }

  // ------------------------------------------------------------------
  // Modificaciones
  // ------------------------------------------------------------------

  async update(
    actor: Actor,
    id: string,
    input: ShiftUpdate,
  ): Promise<ShiftView> {
    const before = await this.getModifiable(actor.companyId, id);
    const current = toLocalShiftTime(
      before.startsAt,
      before.endsAt,
      before.timeZone,
    );
    const local: ShiftInput = {
      date: input.date ?? current.date,
      startTime: input.startTime ?? current.startTime,
      endTime: input.endTime ?? current.endTime,
      breakMinutes: input.breakMinutes ?? before.breakMinutes,
      earlyClockInMinutes:
        input.earlyClockInMinutes ?? before.earlyClockInMinutes,
      lateToleranceMinutes:
        input.lateToleranceMinutes ?? before.lateToleranceMinutes,
    };
    const timing = this.buildTiming(local, before.timeZone, new Date());

    if (before.schedulePeriodId) {
      assertWithinPeriod(
        local.date,
        await this.getPeriod(actor.companyId, before.schedulePeriodId),
      );
    }
    const assigned = activeAssignments(before);
    // Nueva fecha u horario: revalidar estado laboral e incapacidades/permisos
    await this.assertAvailable(
      actor.companyId,
      assigned.map((a) => ({
        employeeId: a.employeeId,
        date: local.date,
        startsAt: timing.startsAt,
        endsAt: timing.endsAt,
      })),
    );

    await this.shifts.reschedule(actor.companyId, id, timing, input.notes);
    const after = await this.get(actor.companyId, id);

    const timeChanged =
      before.startsAt.getTime() !== after.startsAt.getTime() ||
      before.endsAt.getTime() !== after.endsAt.getTime();
    if (timeChanged && before.periodStatus === 'PUBLISHED') {
      await this.shifts.recordChanges(
        actor.companyId,
        assigned.map((a) => ({
          shiftAssignmentId: a.id,
          type: 'TIME_CHANGE',
          previousStartsAt: before.startsAt,
          previousEndsAt: before.endsAt,
          newStartsAt: after.startsAt,
          newEndsAt: after.endsAt,
          actorUserId: actor.userId,
        })),
      );
      await this.notify(
        actor.companyId,
        assigned.map((a) => a.employeeId),
        {
          title: 'Cambió el horario de tu turno',
          body: `Antes: ${describeShift(before.startsAt, before.endsAt, before.timeZone)}. Ahora: ${describeShift(after.startsAt, after.endsAt, after.timeZone)}.`,
          shiftId: id,
        },
      );
    }
    await this.record(
      actor,
      id,
      'shift.updated',
      summarize(before),
      summarize(after),
    );
    return after;
  }

  async cancel(
    actor: Actor,
    id: string,
    reason: string | null,
  ): Promise<ShiftView> {
    const before = await this.getModifiable(actor.companyId, id);
    await this.shifts.cancel(actor.companyId, id);

    const assigned = activeAssignments(before);
    if (before.periodStatus === 'PUBLISHED') {
      await this.shifts.recordChanges(
        actor.companyId,
        assigned.map((a) => ({
          shiftAssignmentId: a.id,
          type: 'CANCELLATION',
          fromEmployeeId: a.employeeId,
          previousStartsAt: before.startsAt,
          previousEndsAt: before.endsAt,
          reason,
          actorUserId: actor.userId,
        })),
      );
      await this.notify(
        actor.companyId,
        assigned.map((a) => a.employeeId),
        {
          title: 'Tu turno fue cancelado',
          body: `${describeShift(before.startsAt, before.endsAt, before.timeZone)}${reason ? `. Motivo: ${reason}` : ''}`,
          shiftId: id,
        },
      );
    }
    await this.record(actor, id, 'shift.cancelled', summarize(before), {
      status: 'CANCELLED',
      reason,
    });
    return this.get(actor.companyId, id);
  }

  async assign(
    actor: Actor,
    id: string,
    employeeIds: string[],
  ): Promise<ShiftView> {
    const shift = await this.getModifiable(actor.companyId, id);
    const date = toLocalShiftTime(
      shift.startsAt,
      shift.endsAt,
      shift.timeZone,
    ).date;
    const unique = [...new Set(employeeIds)];
    await this.assertAvailable(
      actor.companyId,
      unique.map((employeeId) => ({
        employeeId,
        date,
        startsAt: shift.startsAt,
        endsAt: shift.endsAt,
      })),
    );

    const added = await this.shifts.assign(
      actor.companyId,
      id,
      unique,
      actor.userId,
    );
    const after = await this.get(actor.companyId, id);
    if (after.periodStatus === 'PUBLISHED')
      await this.announceAssignments(actor, after, added);
    await this.record(actor, id, 'shift.employees_assigned', undefined, {
      employeeIds: added.map((a) => a.employeeId),
    });
    return after;
  }

  async unassign(
    actor: Actor,
    id: string,
    employeeId: string,
    reason: string | null,
  ): Promise<ShiftView> {
    const shift = await this.getModifiable(actor.companyId, id);
    const assignmentId = await this.shifts.unassign(
      actor.companyId,
      id,
      employeeId,
    );

    if (shift.periodStatus === 'PUBLISHED') {
      await this.shifts.recordChanges(actor.companyId, [
        {
          shiftAssignmentId: assignmentId,
          type: 'CANCELLATION',
          fromEmployeeId: employeeId,
          previousStartsAt: shift.startsAt,
          previousEndsAt: shift.endsAt,
          reason,
          actorUserId: actor.userId,
        },
      ]);
      await this.notify(actor.companyId, [employeeId], {
        title: 'Te retiraron de un turno',
        body: `${describeShift(shift.startsAt, shift.endsAt, shift.timeZone)}${reason ? `. Motivo: ${reason}` : ''}`,
        shiftId: id,
      });
    }
    await this.record(
      actor,
      id,
      'shift.employee_unassigned',
      { employeeId },
      { reason },
    );
    return this.get(actor.companyId, id);
  }

  // ------------------------------------------------------------------
  // Apoyo
  // ------------------------------------------------------------------

  private buildTiming(
    input: ShiftInput,
    timeZone: string,
    now: Date,
    defaults: SchedulingStore['defaults'] = DEFAULTS,
  ): ShiftTiming {
    const timing: ShiftTiming = {
      ...toUtcRange(input, timeZone),
      breakMinutes: input.breakMinutes ?? defaults.breakMinutes,
      earlyClockInMinutes:
        input.earlyClockInMinutes ?? defaults.earlyClockInMinutes,
      lateToleranceMinutes:
        input.lateToleranceMinutes ?? defaults.lateToleranceMinutes,
    };
    assertShiftTiming(timing);
    if (timing.startsAt <= now) {
      throw new InvalidShiftTimingError(
        `El turno del ${input.date} a las ${input.startTime} ya empezó o está en el pasado`,
      );
    }
    return timing;
  }

  private async requireActiveStore(
    companyId: string,
    storeId: string,
  ): Promise<SchedulingStore> {
    const store = await this.shifts.findSchedulingStore(companyId, storeId);
    if (!store) throw new StoreNotFoundError();
    if (!store.isActive) throw new StoreInactiveError();
    return store;
  }

  private async getPeriod(companyId: string, id: string): Promise<PeriodView> {
    const period = await this.periods.findById(companyId, id);
    if (!period) throw new PeriodNotFoundError();
    return period;
  }

  private async requireOpenPeriod(
    companyId: string,
    id: string,
    storeId: string,
  ) {
    const period = await this.getPeriod(companyId, id);
    if (period.status === 'CLOSED')
      throw new PeriodStatusError('El periodo está cerrado');
    if (period.storeId && period.storeId !== storeId)
      throw new ShiftStoreMismatchError();
    return period;
  }

  /** Un turno se puede tocar si no está cancelado, no ha empezado y su periodo no está cerrado. */
  private async getModifiable(
    companyId: string,
    id: string,
  ): Promise<ShiftView> {
    const shift = await this.get(companyId, id);
    if (shift.status === 'CANCELLED') throw new ShiftCancelledError();
    if (shift.startsAt <= new Date()) throw new ShiftAlreadyStartedError();
    if (shift.periodStatus === 'CLOSED')
      throw new PeriodStatusError('El periodo está cerrado');
    return shift;
  }

  /**
   * Estado laboral del empleado en la fecha + incapacidades/permisos aprobados
   * que se crucen con el horario del turno.
   */
  private async assertAvailable(
    companyId: string,
    requests: {
      employeeId: string;
      date: string;
      startsAt: Date;
      endsAt: Date;
    }[],
  ) {
    const unavailable = await this.availabilityIssues(companyId, requests);
    if (unavailable.size) {
      throw new EmployeesNotAvailableError(
        [...unavailable].map(([employeeId, reason]) => ({
          employeeId,
          reason,
        })),
      );
    }
  }

  /**
   * Motivos por los que cada empleado NO puede tomar esos horarios: estado laboral
   * en la fecha + incapacidades/permisos aprobados que se crucen. Vacío = todos pueden.
   */
  async availabilityIssues(
    companyId: string,
    requests: {
      employeeId: string;
      date: string;
      startsAt: Date;
      endsAt: Date;
    }[],
  ): Promise<Map<string, UnavailableReason>> {
    const unavailable = new Map<string, UnavailableReason>();
    if (requests.length === 0) return unavailable;
    const ids = [...new Set(requests.map((r) => r.employeeId))];
    const employees = new Map(
      (await this.shifts.findEmployees(companyId, ids)).map((e) => [e.id, e]),
    );
    const from = new Date(
      Math.min(...requests.map((r) => r.startsAt.getTime())),
    );
    const to = new Date(Math.max(...requests.map((r) => r.endsAt.getTime())));
    const timeOff = await this.shifts.findApprovedTimeOff(
      companyId,
      ids,
      from,
      to,
    );

    for (const r of requests) {
      if (unavailable.has(r.employeeId)) continue;
      const employee = employees.get(r.employeeId);
      let reason: UnavailableReason | null = employee
        ? unavailabilityReason(employee, parseDateOnly(r.date))
        : 'NOT_FOUND';
      if (
        !reason &&
        timeOff.some(
          (t) =>
            t.employeeId === r.employeeId &&
            t.startsAt < r.endsAt &&
            r.startsAt < t.endsAt,
        )
      ) {
        reason = 'ON_TIME_OFF';
      }
      if (reason) unavailable.set(r.employeeId, reason);
    }
    return unavailable;
  }

  private async announceAssignments(
    actor: Actor,
    shift: ShiftView,
    added: { assignmentId: string; employeeId: string }[],
  ) {
    if (added.length === 0) return;
    const changes: ShiftChangeRecord[] = added.map((a) => ({
      shiftAssignmentId: a.assignmentId,
      type: 'REASSIGNMENT',
      toEmployeeId: a.employeeId,
      newStartsAt: shift.startsAt,
      newEndsAt: shift.endsAt,
      actorUserId: actor.userId,
    }));
    await this.shifts.recordChanges(actor.companyId, changes);
    await this.notify(
      actor.companyId,
      added.map((a) => a.employeeId),
      {
        title: 'Tienes un nuevo turno',
        body: `${describeShift(shift.startsAt, shift.endsAt, shift.timeZone)} en ${shift.storeName}.`,
        shiftId: shift.id,
      },
    );
  }

  private async notify(
    companyId: string,
    employeeIds: string[],
    message: { title: string; body: string; shiftId: string },
  ) {
    const users = await this.shifts.findUserIdsByEmployee(
      companyId,
      employeeIds,
    );
    await this.notifier.notify(
      [...users.values()].map((userId) => ({
        companyId,
        userId,
        type: 'SHIFT_CHANGED' as const,
        title: message.title,
        body: message.body,
        data: { shiftId: message.shiftId },
      })),
    );
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
      entityType: 'Shift',
      entityId: id,
      before,
      after,
    });
  }
}

function activeAssignments(shift: ShiftView) {
  return shift.assignments.filter((a) => a.status === 'ASSIGNED');
}

function assertWithinPeriod(date: string, period: PeriodView) {
  if (
    date < formatDateOnly(period.startDate) ||
    date > formatDateOnly(period.endDate)
  ) {
    throw new ShiftOutsidePeriodError(date);
  }
}

function summarize(s: ShiftView) {
  return {
    startsAt: s.startsAt,
    endsAt: s.endsAt,
    breakMinutes: s.breakMinutes,
    earlyClockInMinutes: s.earlyClockInMinutes,
    lateToleranceMinutes: s.lateToleranceMinutes,
    employeeIds: activeAssignments(s).map((a) => a.employeeId),
  };
}
