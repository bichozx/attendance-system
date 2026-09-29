import { Injectable } from '@nestjs/common';
import type { Actor } from '../../../shared/application/audit-log';
import { parseDateOnly } from '../../../shared/domain/date-only';
import { utcToLocal } from '../../../shared/domain/zoned-time';
import { LocationVerifier } from '../../stores/application/location-verifier';
import type { LocationCheckResult } from '../../stores/domain/geofence.rules';
import {
  IdempotencyKeyReusedError,
  NotAnEmployeeError,
} from '../domain/attendance.errors';
import {
  AttendanceRepository,
  AttendanceUnitOfWork,
  ClockingEmployee,
  StoredEvent,
} from '../domain/attendance.repository';
import {
  computeWorkMetrics,
  evaluateClockOut,
  evaluateOfflineTiming,
  lateMinutesFor,
  selectShiftForClockIn,
} from '../domain/attendance.rules';
import type {
  ClockRejection,
  ClockType,
  EventSource,
  LocationFixInput,
  ReviewReason,
  ShiftForClock,
  WorkMetrics,
} from '../domain/attendance.types';

export interface ClockCommand {
  type: ClockType;
  fix: LocationFixInput;
  /** Opcional en la entrada: fuerza un turno concreto. */
  shiftId?: string;
  idempotencyKey: string;
  deviceInfo?: Record<string, unknown>;
}

interface Timing {
  source: EventSource;
  effectiveAt: Date;
  clientTimestamp: Date | null;
  driftSeconds: number | null;
  rejection: ClockRejection | null;
  reviewReasons: ReviewReason[];
}

export interface ClockResult {
  eventId: string;
  type: ClockType;
  accepted: boolean;
  rejection: ClockRejection | null;
  /** Hora oficial registrada. */
  effectiveAt: Date;
  source: EventSource;
  /** true si ya se había procesado esta idempotencyKey (reintento). */
  replayed: boolean;
  attendanceId: string | null;
  shiftId: string | null;
  location: {
    withinGeofence: boolean | null;
    distanceMeters: number | null;
    accuracyMeters: number | null;
  };
  /** Si fue TOO_EARLY: desde cuándo puede marcar. */
  opensAt: Date | null;
  lateMinutes: number | null;
  metrics: WorkMetrics | null;
  needsReview: boolean;
}

/** Resultado de ubicación con el motivo ampliado (incluye GPS falso). */
type LocationOutcome = Omit<LocationCheckResult, 'rejection'> & {
  rejection: ClockRejection | null;
};

export interface OfflineEvent extends ClockCommand {
  clientTimestamp: Date;
}

@Injectable()
export class ClockService {
  constructor(
    private readonly repo: AttendanceRepository,
    private readonly locations: LocationVerifier,
  ) {}

  /** Marcación en línea: la hora oficial es la del servidor. */
  async clock(actor: Actor, cmd: ClockCommand): Promise<ClockResult> {
    const now = new Date();
    return this.process(actor, await this.employee(actor), cmd, {
      source: 'MOBILE_APP',
      effectiveAt: now,
      clientTimestamp: null,
      driftSeconds: null,
      rejection: null,
      reviewReasons: [],
    });
  }

  /**
   * Sincroniza marcaciones hechas sin conexión. Se procesan en orden cronológico
   * (la entrada antes que la salida) y se responde en el orden recibido.
   */
  async sync(actor: Actor, deviceNow: Date, events: OfflineEvent[]) {
    const employee = await this.employee(actor);
    const serverNow = new Date();

    const planned = events
      .map((event, index) => ({
        event,
        index,
        timing: evaluateOfflineTiming(
          event.clientTimestamp,
          deviceNow,
          serverNow,
        ),
      }))
      .sort(
        (a, b) =>
          a.timing.effectiveAt.getTime() - b.timing.effectiveAt.getTime(),
      );

    const results: (ClockResult | { error: string; message: string })[] =
      new Array(events.length);
    for (const { event, index, timing } of planned) {
      try {
        results[index] = await this.process(actor, employee, event, {
          source: 'OFFLINE_SYNC',
          effectiveAt: timing.effectiveAt,
          clientTimestamp: event.clientTimestamp,
          driftSeconds: timing.driftSeconds,
          rejection: timing.rejection,
          reviewReasons: timing.reviewReasons,
        });
      } catch (error) {
        // Un evento con problema (ej. clave reutilizada) no detiene los demás
        const e = error as { code?: string; message: string };
        results[index] = { error: e.code ?? 'ERROR', message: e.message };
      }
    }
    return { serverTime: serverNow, results };
  }

  // ------------------------------------------------------------------

  private async employee(actor: Actor): Promise<ClockingEmployee> {
    const employee = await this.repo.findEmployeeByUser(
      actor.companyId,
      actor.userId,
    );
    if (!employee) throw new NotAnEmployeeError();
    return employee;
  }

  private async process(
    actor: Actor,
    employee: ClockingEmployee,
    cmd: ClockCommand,
    timing: Timing,
  ): Promise<ClockResult> {
    // Reintento rápido sin bloquear (el caso normal cuando la red falla y la app reenvía)
    const previous = await this.repo.findEventByKey(
      actor.companyId,
      cmd.idempotencyKey,
    );
    if (previous) return replay(previous, employee, cmd.type);

    return this.repo.inEmployeeLock(
      actor.companyId,
      employee.id,
      async (uow) => {
        const again = await uow.findEventByKey(cmd.idempotencyKey);
        if (again) return replay(again, employee, cmd.type);

        const ctx = new ClockContext(uow, employee, cmd, timing);
        if (employee.status !== 'ACTIVE')
          return ctx.reject('EMPLOYEE_NOT_ACTIVE');
        if (timing.rejection) return ctx.reject(timing.rejection);

        return cmd.type === 'CLOCK_IN'
          ? this.clockIn(actor, ctx)
          : this.clockOut(actor, ctx);
      },
    );
  }

  private async clockIn(actor: Actor, ctx: ClockContext): Promise<ClockResult> {
    const at = ctx.timing.effectiveAt;
    let shifts = await ctx.uow.findShiftsAround(ctx.employee.id, at);
    if (ctx.cmd.shiftId)
      shifts = shifts.filter((s) => s.shiftId === ctx.cmd.shiftId);

    const selection = selectShiftForClockIn(shifts, at);
    if (selection.rejection) {
      return ctx.reject(selection.rejection, {
        shift: selection.shift,
        opensAt: 'opensAt' in selection ? selection.opensAt : undefined,
      });
    }
    const shift = selection.shift;

    const location = await this.checkLocation(actor, ctx, shift);
    if (!location.accepted) {
      return ctx.reject(location.rejection!, { shift, location });
    }

    const lateMinutes = lateMinutesFor(shift, at);
    const attendance = await ctx.uow.recordClockIn({
      shift,
      employeeId: ctx.employee.id,
      workDate: parseDateOnly(utcToLocal(shift.startsAt, shift.timeZone).date),
      at,
      fix: ctx.cmd.fix,
      lateMinutes,
      reviewReasons: ctx.timing.reviewReasons,
    });
    return ctx.accept({
      shift,
      location,
      attendanceId: attendance.id,
      lateMinutes,
      needsReview: attendance.needsReview,
    });
  }

  private async clockOut(
    actor: Actor,
    ctx: ClockContext,
  ): Promise<ClockResult> {
    const at = ctx.timing.effectiveAt;
    const open = await ctx.uow.findOpenAttendance(ctx.employee.id);
    if (!open) return ctx.reject('NOT_CLOCKED_IN');

    const { attendance, shift } = open;
    const windowRejection = evaluateClockOut(shift, attendance.clockInAt!, at);
    if (windowRejection) {
      return ctx.reject(windowRejection, {
        shift,
        attendanceId: attendance.id,
      });
    }

    const location = await this.checkLocation(actor, ctx, shift);
    if (!location.accepted) {
      return ctx.reject(location.rejection!, {
        shift,
        location,
        attendanceId: attendance.id,
      });
    }

    const metrics = computeWorkMetrics(shift, attendance.clockInAt!, at);
    const updated = await ctx.uow.recordClockOut(attendance.id, {
      at,
      fix: ctx.cmd.fix,
      metrics,
      reviewReasons: ctx.timing.reviewReasons,
    });
    return ctx.accept({
      shift,
      location,
      attendanceId: attendance.id,
      lateMinutes: metrics.lateMinutes,
      metrics,
      needsReview: updated.needsReview,
    });
  }

  /** GPS falso primero; después, la misma regla de geocercas del módulo de establecimientos. */
  private async checkLocation(
    actor: Actor,
    ctx: ClockContext,
    shift: ShiftForClock,
  ): Promise<LocationOutcome> {
    const fix = ctx.cmd.fix;
    if (fix.mocked) {
      return {
        accepted: false,
        rejection: 'MOCK_LOCATION',
        geofenceId: null,
        distanceMeters: null,
        radiusMeters: null,
        accuracyMeters: fix.accuracyMeters,
      };
    }
    return this.locations.verify(actor.companyId, shift.storeId, fix);
  }
}

/** Arma y guarda el evento (aceptado o rechazado) con todo el contexto de la marcación. */
class ClockContext {
  constructor(
    readonly uow: AttendanceUnitOfWork,
    readonly employee: ClockingEmployee,
    readonly cmd: ClockCommand,
    readonly timing: Timing,
  ) {}

  reject(
    rejection: ClockRejection,
    extra: {
      shift?: ShiftForClock | null;
      location?: LocationOutcome;
      opensAt?: Date;
      attendanceId?: string;
    } = {},
  ) {
    return this.save('REJECTED', rejection, {
      ...extra,
      attendanceId: extra.attendanceId ?? extra.shift?.attendance?.id ?? null,
      lateMinutes: null,
      metrics: null,
      needsReview: false,
    });
  }

  accept(data: {
    shift: ShiftForClock;
    location: LocationOutcome;
    attendanceId: string;
    lateMinutes: number;
    metrics?: WorkMetrics;
    needsReview: boolean;
  }) {
    return this.save('ACCEPTED', null, {
      ...data,
      metrics: data.metrics ?? null,
    });
  }

  private async save(
    result: 'ACCEPTED' | 'REJECTED',
    rejection: ClockRejection | null,
    data: {
      shift?: ShiftForClock | null;
      location?: LocationOutcome;
      opensAt?: Date;
      attendanceId: string | null;
      lateMinutes: number | null;
      metrics: WorkMetrics | null;
      needsReview: boolean;
    },
  ): Promise<ClockResult> {
    const { fix } = this.cmd;
    const loc = data.location;
    const event = await this.uow.saveEvent({
      employeeId: this.employee.id,
      attendanceId: data.attendanceId,
      type: this.cmd.type,
      result,
      rejectionReason: rejection,
      source: this.timing.source,
      serverTimestamp: this.timing.effectiveAt,
      clientTimestamp: this.timing.clientTimestamp,
      clockDriftSeconds: this.timing.driftSeconds,
      latitude: fix.latitude,
      longitude: fix.longitude,
      accuracyMeters: fix.accuracyMeters,
      distanceMeters: loc?.distanceMeters ?? null,
      withinGeofence: loc && loc.distanceMeters !== null ? loc.accepted : null,
      geofenceId: loc?.geofenceId ?? null,
      deviceInfo: {
        ...this.cmd.deviceInfo,
        ...(fix.mocked && { mocked: true }),
      },
      idempotencyKey: this.cmd.idempotencyKey,
    });

    return {
      eventId: event.id,
      type: this.cmd.type,
      accepted: result === 'ACCEPTED',
      rejection,
      effectiveAt: this.timing.effectiveAt,
      source: this.timing.source,
      replayed: false,
      attendanceId: data.attendanceId,
      shiftId: data.shift?.shiftId ?? null,
      location: {
        withinGeofence: event.withinGeofence,
        distanceMeters: loc?.distanceMeters ?? null,
        accuracyMeters: fix.accuracyMeters,
      },
      opensAt: data.opensAt ?? null,
      lateMinutes: data.lateMinutes,
      metrics: data.metrics,
      needsReview: data.needsReview,
    };
  }
}

function replay(
  event: StoredEvent,
  employee: ClockingEmployee,
  type: ClockType,
): ClockResult {
  if (event.employeeId !== employee.id || event.type !== type) {
    throw new IdempotencyKeyReusedError();
  }
  const a = event.attendance;
  const completed =
    event.type === 'CLOCK_OUT' && event.result === 'ACCEPTED' && a;
  return {
    eventId: event.id,
    type,
    accepted: event.result === 'ACCEPTED',
    rejection: event.rejectionReason as ClockRejection | null,
    effectiveAt: event.serverTimestamp,
    source: event.source,
    replayed: true,
    attendanceId: a?.id ?? null,
    shiftId: a?.shiftId ?? null,
    location: {
      withinGeofence: event.withinGeofence,
      distanceMeters: event.distanceMeters,
      accuracyMeters: event.accuracyMeters,
    },
    opensAt: null,
    lateMinutes: event.result === 'ACCEPTED' && a ? a.lateMinutes : null,
    metrics: completed
      ? {
          lateMinutes: a.lateMinutes,
          earlyLeaveMinutes: a.earlyLeaveMinutes,
          workedMinutes: a.workedMinutes,
          overtimeMinutes: a.overtimeMinutes,
        }
      : null,
    needsReview: a?.needsReview ?? false,
  };
}
