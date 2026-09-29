import { Injectable } from '@nestjs/common';
import { Actor, AuditLog } from '../../../shared/application/audit-log';
import { Notifier } from '../../../shared/application/notifier';
import { PageRequest, toPage } from '../../../shared/application/page';
import { addDays, localToUtc } from '../../../shared/domain/zoned-time';
import { AttendanceReviewService } from '../../attendance/application/attendance-review.service';
import {
  AttendanceNotFoundError,
  NotAnEmployeeError,
} from '../../attendance/domain/attendance.errors';
import {
  IncidentDuplicateError,
  IncidentNotFoundError,
  IncidentStatusError,
  InvalidIncidentError,
  SelfApprovalError,
  TimeOffOverlapError,
} from '../domain/incident.errors';
import {
  AffectedShift,
  IncidentRepository,
} from '../domain/incident.repository';
import {
  assertAttendanceFits,
  INCIDENT_RULES,
  IncidentAction,
  MAX_REQUEST_AGE_DAYS,
  MAX_TIME_OFF_DAYS,
  nextStatus,
  resolveMinutes,
  resolveMissedClock,
} from '../domain/incident.rules';
import type {
  AttendanceForIncident,
  IncidentFilter,
  IncidentType,
  IncidentView,
  NewIncident,
} from '../domain/incident.types';

export interface IncidentInput {
  type: IncidentType;
  description: string;
  attendanceId?: string;
  minutes?: number;
  /** Días completos (incapacidad, permiso de días, u "otro" sin jornada). */
  startDate?: string;
  endDate?: string;
  /** Permiso por horas: fecha + franja local. */
  date?: string;
  startTime?: string;
  endTime?: string;
  /** Olvido de marcación: horas propuestas. */
  clockInAt?: Date;
  clockOutAt?: Date;
  attachmentUrl?: string;
}

const TYPE_LABEL: Record<IncidentType, string> = {
  SICK_LEAVE: 'incapacidad',
  PERMISSION: 'permiso',
  ABSENCE: 'justificación de ausencia',
  LATE_ARRIVAL: 'justificación de tardanza',
  EARLY_DEPARTURE: 'salida anticipada',
  OVERTIME: 'horas extra',
  MISSED_CLOCK: 'corrección de marcación',
  SHIFT_CHANGE: 'cambio de turno',
  GPS_APP_ISSUE: 'reporte de falla de GPS/app',
  OTHER: 'novedad',
};

@Injectable()
export class IncidentsService {
  constructor(
    private readonly repo: IncidentRepository,
    private readonly attendanceReview: AttendanceReviewService,
    private readonly notifier: Notifier,
    private readonly audit: AuditLog,
  ) {}

  // ------------------------------------------------------------------
  // Consultas
  // ------------------------------------------------------------------

  async list(companyId: string, filter: IncidentFilter, page: PageRequest) {
    const { items, total } = await this.repo.list(companyId, filter, page);
    return toPage(items, total, page);
  }

  async get(companyId: string, id: string): Promise<IncidentView> {
    const incident = await this.repo.findById(companyId, id);
    if (!incident) throw new IncidentNotFoundError();
    return incident;
  }

  async myList(actor: Actor, filter: IncidentFilter, page: PageRequest) {
    const employee = await this.myEmployee(actor);
    return this.list(
      actor.companyId,
      { ...filter, employeeId: employee.id },
      page,
    );
  }

  // ------------------------------------------------------------------
  // Creación
  // ------------------------------------------------------------------

  /** El empleado solicita: queda PENDING. */
  async request(actor: Actor, input: IncidentInput): Promise<IncidentView> {
    const employee = await this.myEmployee(actor);
    const data = await this.build(actor.companyId, employee.id, input, true);
    const incident = await this.repo.create(actor.companyId, {
      ...data,
      status: 'PENDING',
      requestedById: actor.userId,
    });
    await this.record(
      actor,
      incident.id,
      'incident.requested',
      undefined,
      incident,
    );
    return incident;
  }

  /**
   * El supervisor registra una novedad de un empleado (ej. le entregaron la incapacidad
   * en papel). Queda aprobada de inmediato y aplica sus efectos.
   */
  async registerApproved(
    actor: Actor,
    employeeId: string,
    input: IncidentInput,
  ) {
    const employee = await this.repo.findEmployee(actor.companyId, employeeId);
    if (!employee)
      throw new InvalidIncidentError('El empleado no existe en la empresa');
    if (employee.userId === actor.userId) throw new SelfApprovalError();

    const data = await this.build(actor.companyId, employeeId, input, false);
    const incident = await this.repo.create(actor.companyId, {
      ...data,
      status: 'PENDING',
      requestedById: actor.userId,
    });
    return this.approve(actor, incident.id, {});
  }

  // ------------------------------------------------------------------
  // Aprobación
  // ------------------------------------------------------------------

  async approve(
    actor: Actor,
    id: string,
    input: { minutes?: number; notes?: string },
  ) {
    const incident = await this.get(actor.companyId, id);
    this.assertNotSelf(actor, incident);
    const status = nextStatus(incident.status, 'APPROVE');

    let minutes: number | undefined;
    if (input.minutes !== undefined) {
      if (incident.minutes === null) {
        throw new InvalidIncidentError('Esta novedad no lleva minutos');
      }
      if (input.minutes < 1 || input.minutes > incident.minutes) {
        throw new InvalidIncidentError(
          `Puede aprobar entre 1 y ${incident.minutes} minutos`,
        );
      }
      minutes = input.minutes;
    }

    await this.claim(actor, incident, 'APPROVE', {
      status,
      notes: input.notes ?? null,
      minutes,
    });
    let affectedShifts: AffectedShift[] = [];
    try {
      affectedShifts = await this.applyEffects(actor, incident);
    } catch (error) {
      // Si el efecto falla (ej. horas de corrección inválidas), la novedad vuelve a pendiente
      await this.repo.transition(actor.companyId, id, 'APPROVED', {
        status: 'PENDING',
        reviewedById: null,
        reviewNotes: null,
      });
      throw error;
    }

    const after = await this.get(actor.companyId, id);
    await this.notifyResolution(actor, after, 'aprobada');
    await this.record(
      actor,
      id,
      'incident.approved',
      { status: incident.status },
      {
        status,
        minutes: after.minutes,
        notes: input.notes ?? null,
        affectedShifts: affectedShifts.map((s) => s.shiftId),
      },
    );
    return { incident: after, affectedShifts };
  }

  async reject(actor: Actor, id: string, notes: string) {
    const incident = await this.get(actor.companyId, id);
    this.assertNotSelf(actor, incident);
    const status = nextStatus(incident.status, 'REJECT');
    await this.claim(actor, incident, 'REJECT', { status, notes });
    const after = await this.get(actor.companyId, id);
    await this.notifyResolution(actor, after, 'rechazada');
    await this.record(
      actor,
      id,
      'incident.rejected',
      { status: incident.status },
      { status, notes },
    );
    return after;
  }

  /** El empleado retira su propia solicitud pendiente. */
  async cancelOwn(actor: Actor, id: string) {
    const employee = await this.myEmployee(actor);
    const incident = await this.get(actor.companyId, id);
    if (incident.employee.id !== employee.id) throw new IncidentNotFoundError();
    const status = nextStatus(incident.status, 'CANCEL_OWN');
    await this.claim(actor, incident, 'CANCEL_OWN', {
      status,
      notes: null,
      reviewer: false,
    });
    await this.record(
      actor,
      id,
      'incident.cancelled',
      { status: incident.status },
      { status },
    );
    return this.get(actor.companyId, id);
  }

  /**
   * El supervisor anula una aprobada (ej. incapacidad cargada por error).
   * Un olvido de marcación ya corrigió la asistencia: eso se revierte con un ajuste manual.
   */
  async revoke(actor: Actor, id: string, notes: string) {
    const incident = await this.get(actor.companyId, id);
    if (incident.type === 'MISSED_CLOCK') {
      throw new IncidentStatusError(
        'La corrección de marcación ya se aplicó a la asistencia; use un ajuste manual para revertirla',
      );
    }
    const status = nextStatus(incident.status, 'REVOKE');
    await this.claim(actor, incident, 'REVOKE', { status, notes });
    const after = await this.get(actor.companyId, id);
    await this.notifyResolution(actor, after, 'anulada');
    await this.record(
      actor,
      id,
      'incident.revoked',
      { status: incident.status },
      { status, notes },
    );
    return after;
  }

  // ------------------------------------------------------------------
  // Construcción y validación según el tipo
  // ------------------------------------------------------------------

  private async build(
    companyId: string,
    employeeId: string,
    input: IncidentInput,
    byEmployee: boolean,
  ): Promise<Omit<NewIncident, 'status' | 'requestedById'>> {
    const rules = INCIDENT_RULES[input.type];
    if (rules.attendance === 'required' && !input.attendanceId) {
      throw new InvalidIncidentError(
        `Una ${TYPE_LABEL[input.type]} debe indicar la jornada (attendanceId)`,
      );
    }
    if (rules.attendance === 'none' && input.attendanceId) {
      throw new InvalidIncidentError(
        `Una ${TYPE_LABEL[input.type]} no se asocia a una jornada`,
      );
    }
    if (
      input.type !== 'MISSED_CLOCK' &&
      (input.clockInAt || input.clockOutAt)
    ) {
      throw new InvalidIncidentError(
        'Solo una corrección de marcación lleva horas de entrada/salida',
      );
    }

    let attendance: AttendanceForIncident | null = null;
    if (input.attendanceId) {
      attendance = await this.repo.findAttendance(
        companyId,
        input.attendanceId,
      );
      // Una jornada de otro empleado se trata como inexistente
      if (!attendance || attendance.employeeId !== employeeId)
        throw new AttendanceNotFoundError();
      assertAttendanceFits(input.type, attendance);
      const duplicate = await this.repo.findActiveForAttendance(
        companyId,
        attendance.id,
        input.type,
      );
      if (duplicate) throw new IncidentDuplicateError(duplicate);
    }

    const minutes = resolveMinutes(input.type, attendance, input.minutes);
    const timeZone = await this.repo.companyTimeZone(companyId);
    const range = await this.resolveRange(
      companyId,
      employeeId,
      input,
      attendance,
      timeZone,
    );

    if (byEmployee) {
      const oldest = Date.now() - MAX_REQUEST_AGE_DAYS * 86_400_000;
      if (range.startsAt.getTime() < oldest) {
        throw new InvalidIncidentError(
          `Solo se pueden reportar novedades de los últimos ${MAX_REQUEST_AGE_DAYS} días`,
        );
      }
    }

    return {
      employeeId,
      type: input.type,
      attendanceId: attendance?.id ?? null,
      ...range,
      minutes,
      description: input.description,
      attachmentUrl: input.attachmentUrl ?? null,
    };
  }

  private async resolveRange(
    companyId: string,
    employeeId: string,
    input: IncidentInput,
    attendance: AttendanceForIncident | null,
    timeZone: string,
  ): Promise<{ startsAt: Date; endsAt: Date | null }> {
    const rules = INCIDENT_RULES[input.type];

    if (rules.range) {
      let range: { startsAt: Date; endsAt: Date };
      if (input.startDate) {
        const endDate = input.endDate ?? input.startDate;
        if (endDate < input.startDate)
          throw new InvalidIncidentError('endDate es anterior a startDate');
        const days =
          (Date.parse(endDate) - Date.parse(input.startDate)) / 86_400_000 + 1;
        if (days > MAX_TIME_OFF_DAYS) {
          throw new InvalidIncidentError(
            `Máximo ${MAX_TIME_OFF_DAYS} días por novedad`,
          );
        }
        range = {
          startsAt: localToUtc(input.startDate, '00:00', timeZone),
          endsAt: localToUtc(addDays(endDate, 1), '00:00', timeZone),
        };
      } else if (
        input.type === 'PERMISSION' &&
        input.date &&
        input.startTime &&
        input.endTime
      ) {
        if (input.endTime <= input.startTime) {
          throw new InvalidIncidentError(
            'La hora final del permiso debe ser posterior a la inicial',
          );
        }
        range = {
          startsAt: localToUtc(input.date, input.startTime, timeZone),
          endsAt: localToUtc(input.date, input.endTime, timeZone),
        };
      } else {
        throw new InvalidIncidentError(
          input.type === 'SICK_LEAVE'
            ? 'Una incapacidad requiere startDate (y endDate si dura varios días)'
            : 'Un permiso requiere startDate/endDate (días) o date + startTime + endTime (horas)',
        );
      }
      const overlap = await this.repo.findOverlappingTimeOff(
        companyId,
        employeeId,
        range.startsAt,
        range.endsAt,
      );
      if (overlap) throw new TimeOffOverlapError(overlap);
      return range;
    }

    if (input.type === 'MISSED_CLOCK') {
      return resolveMissedClock(attendance!, {
        clockInAt: input.clockInAt,
        clockOutAt: input.clockOutAt,
      });
    }
    if (attendance) {
      return {
        startsAt: attendance.shift.startsAt,
        endsAt: attendance.shift.endsAt,
      };
    }
    if (!input.startDate) {
      throw new InvalidIncidentError(
        'Indique la jornada (attendanceId) o la fecha (startDate)',
      );
    }
    return {
      startsAt: localToUtc(input.startDate, '00:00', timeZone),
      endsAt: localToUtc(
        addDays(input.endDate ?? input.startDate, 1),
        '00:00',
        timeZone,
      ),
    };
  }

  // ------------------------------------------------------------------
  // Efectos de la aprobación
  // ------------------------------------------------------------------

  private async applyEffects(
    actor: Actor,
    incident: IncidentView,
  ): Promise<AffectedShift[]> {
    const { companyId } = actor;
    switch (incident.type) {
      case 'MISSED_CLOCK':
        // Corrige la asistencia con las horas propuestas (queda evento MANUAL_ADJUSTMENT)
        await this.attendanceReview.adjust(actor, incident.attendanceId!, {
          clockInAt: incident.startsAt,
          clockOutAt: incident.endsAt,
          reason:
            `Novedad aprobada (corrección de marcación): ${incident.description ?? ''}`.trim(),
        });
        return [];

      case 'ABSENCE':
      case 'GPS_APP_ISSUE':
        if (incident.attendanceId) {
          await this.repo.markAttendancesReviewed(
            companyId,
            [incident.attendanceId],
            actor.userId,
          );
        }
        return [];

      case 'SICK_LEAVE':
      case 'PERMISSION': {
        const covered = await this.repo.findCoveredAbsences(
          companyId,
          incident.employee.id,
          incident.startsAt,
          incident.endsAt!,
        );
        await this.repo.markAttendancesReviewed(
          companyId,
          covered,
          actor.userId,
        );
        // Turnos futuros que la persona ya no podrá cubrir: el supervisor debe reasignarlos
        return this.repo.findAffectedShifts(
          companyId,
          incident.employee.id,
          incident.startsAt,
          incident.endsAt!,
        );
      }

      default:
        return [];
    }
  }

  // ------------------------------------------------------------------
  // Apoyo
  // ------------------------------------------------------------------

  private async myEmployee(actor: Actor) {
    const employee = await this.repo.findEmployeeByUser(
      actor.companyId,
      actor.userId,
    );
    if (!employee) throw new NotAnEmployeeError();
    return employee;
  }

  private assertNotSelf(actor: Actor, incident: IncidentView) {
    if (incident.employee.userId === actor.userId)
      throw new SelfApprovalError();
  }

  /** Cambio de estado condicional: si otro supervisor se adelantó, error de estado. */
  private async claim(
    actor: Actor,
    incident: IncidentView,
    action: IncidentAction,
    change: {
      status: IncidentView['status'];
      notes: string | null;
      minutes?: number;
      reviewer?: boolean;
    },
  ) {
    const ok = await this.repo.transition(
      actor.companyId,
      incident.id,
      incident.status,
      {
        status: change.status,
        reviewedById: change.reviewer === false ? null : actor.userId,
        reviewNotes: change.notes,
        minutes: change.minutes,
      },
    );
    if (!ok) {
      throw new IncidentStatusError(
        `La novedad cambió de estado mientras se procesaba (${action})`,
      );
    }
  }

  private async notifyResolution(
    actor: Actor,
    incident: IncidentView,
    verb: string,
  ) {
    const userId = incident.employee.userId;
    if (!userId || userId === actor.userId) return;
    const label = TYPE_LABEL[incident.type];
    await this.notifier.notify([
      {
        companyId: actor.companyId,
        userId,
        type: 'INCIDENT_RESOLVED',
        title: `Novedad ${verb}: ${label}`,
        body: incident.reviewNotes
          ? `Nota del supervisor: ${incident.reviewNotes}`
          : `Revisa el detalle en la app.`,
        data: { incidentId: incident.id, status: incident.status },
      },
    ]);
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
      entityType: 'Incident',
      entityId: id,
      before,
      after,
    });
  }
}
