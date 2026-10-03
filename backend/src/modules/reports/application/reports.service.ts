import { Injectable } from '@nestjs/common';
import { Actor, AuditLog } from '../../../shared/application/audit-log';
import {
  formatDateOnly,
  parseDateOnly,
} from '../../../shared/domain/date-only';
import { todayIn, utcToLocal } from '../../../shared/domain/zoned-time';
import { assertRange } from '../../../shared/presentation/date-range';
import { TimesheetService } from '../../incidents/application/timesheet.service';
import { ATTENDANCE_STATUS_LABEL, INCIDENT_LABEL } from '../domain/labels';
import { ReportTable, ReportWriter } from '../domain/report-table';
import {
  AttendanceDetailFilter,
  ReportsRepository,
} from '../domain/reports.repository';

export const MAX_EXPORT_ROWS = 20_000;

export interface ReportFile {
  filename: string;
  contentType: string;
  content: Buffer;
}

export interface DetailQuery {
  from: string;
  to: string;
  storeId?: string;
  employeeId?: string;
  status?: AttendanceDetailFilter['status'];
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly repo: ReportsRepository,
    private readonly timesheets: TimesheetService,
    private readonly audit: AuditLog,
  ) {}

  /** Detalle de asistencia como tabla (sirve para la vista previa y para exportar). */
  async attendanceTable(
    companyId: string,
    q: DetailQuery,
  ): Promise<ReportTable & { truncated: boolean }> {
    assertRange(q.from, q.to);
    const { name, timezone } = await this.repo.company(companyId);
    const { rows, truncated } = await this.repo.attendanceDetail(
      companyId,
      {
        from: parseDateOnly(q.from),
        to: parseDateOnly(q.to),
        storeId: q.storeId,
        employeeId: q.employeeId,
        status: q.status,
      },
      MAX_EXPORT_ROWS,
    );
    const time = (d: Date | null, tz: string) =>
      d ? utcToLocal(d, tz).time : '';
    return {
      title: 'Detalle de asistencia',
      subtitle: await this.subtitle(companyId, name, q.from, q.to, q.storeId),
      generatedAt: this.now(timezone),
      truncated,
      totals: true,
      columns: [
        { key: 'date', header: 'Fecha', width: 11 },
        { key: 'code', header: 'Código', width: 9 },
        { key: 'name', header: 'Empleado', width: 19 },
        { key: 'document', header: 'Documento', width: 12 },
        { key: 'store', header: 'Establecimiento', width: 16 },
        { key: 'shift', header: 'Turno', width: 11 },
        { key: 'in', header: 'Entrada', width: 8 },
        { key: 'out', header: 'Salida', width: 8 },
        { key: 'status', header: 'Estado', width: 10 },
        { key: 'scheduled', header: 'Programado', type: 'minutes', width: 12 },
        { key: 'worked', header: 'Trabajado', type: 'minutes', width: 10 },
        { key: 'late', header: 'Tarde (min)', type: 'number', width: 8 },
        { key: 'early', header: 'Salida ant. (min)', type: 'number', width: 9 },
        { key: 'overtime', header: 'Extra (min)', type: 'number', width: 8 },
        { key: 'justifications', header: 'Novedades aprobadas', width: 24 },
        { key: 'review', header: 'Revisar', width: 9 },
      ],
      rows: rows.map((r) => ({
        date: formatDateOnly(r.workDate),
        code: r.employee.code,
        name: `${r.employee.firstName} ${r.employee.lastName}`,
        document: r.employee.documentNumber,
        store: r.storeName,
        shift: `${time(r.shiftStartsAt, r.timeZone)}–${time(r.shiftEndsAt, r.timeZone)}`,
        in: time(r.clockInAt, r.timeZone),
        out: time(r.clockOutAt, r.timeZone),
        status: ATTENDANCE_STATUS_LABEL[r.status] ?? r.status,
        scheduled: r.scheduledMinutes,
        worked: r.workedMinutes,
        late: r.lateMinutes,
        early: r.earlyLeaveMinutes,
        overtime: r.overtimeMinutes,
        justifications: r.justifications
          .map((j) => INCIDENT_LABEL[j] ?? j)
          .join(', '),
        review: r.needsReview ? 'Sí' : '',
      })),
    };
  }

  /** Consolidado para nómina como tabla. */
  async timesheetTable(
    companyId: string,
    q: { from: string; to: string; storeId?: string },
  ): Promise<ReportTable> {
    const { name, timezone } = await this.repo.company(companyId);
    const ts = await this.timesheets.build(companyId, q.from, q.to, {
      storeId: q.storeId,
    });
    return {
      title: 'Consolidado para nómina',
      subtitle: await this.subtitle(companyId, name, q.from, q.to, q.storeId),
      generatedAt: this.now(timezone),
      totals: true,
      columns: [
        { key: 'code', header: 'Código', width: 9 },
        { key: 'name', header: 'Empleado', width: 22 },
        { key: 'shifts', header: 'Turnos', type: 'number', width: 7 },
        { key: 'scheduled', header: 'Programado', type: 'minutes', width: 10 },
        { key: 'worked', header: 'Trabajado', type: 'minutes', width: 10 },
        {
          key: 'lateUnexcused',
          header: 'Tarde injustif. (min)',
          type: 'number',
          width: 10,
        },
        {
          key: 'earlyUnexcused',
          header: 'Salida ant. injustif. (min)',
          type: 'number',
          width: 11,
        },
        {
          key: 'otApproved',
          header: 'Extra aprobada',
          type: 'minutes',
          width: 10,
        },
        {
          key: 'otPending',
          header: 'Extra pendiente',
          type: 'minutes',
          width: 10,
        },
        {
          key: 'absUnjustified',
          header: 'Ausencias injustif.',
          type: 'number',
          width: 9,
        },
        {
          key: 'absJustified',
          header: 'Ausencias justif.',
          type: 'number',
          width: 9,
        },
        {
          key: 'sickDays',
          header: 'Días incapacidad',
          type: 'number',
          width: 9,
        },
        { key: 'permission', header: 'Permisos', type: 'minutes', width: 9 },
        { key: 'review', header: 'Por revisar', type: 'number', width: 8 },
      ],
      rows: ts.rows.map((r) => ({
        code: r.employee.code,
        name: `${r.employee.firstName} ${r.employee.lastName}`,
        shifts: r.shifts,
        scheduled: r.scheduledMinutes,
        worked: r.workedMinutes,
        lateUnexcused: r.late.unexcused,
        earlyUnexcused: r.earlyLeave.unexcused,
        otApproved: r.overtime.approved,
        otPending: r.overtime.pending,
        absUnjustified: r.absences.unjustified,
        absJustified: r.absences.justified,
        sickDays: r.sickLeaveDays,
        permission: r.permissionMinutes,
        review: r.pendingReview,
      })),
    };
  }

  /** Genera el archivo y deja constancia: es información que sale del sistema. */
  async export(
    actor: Actor,
    report: 'attendance' | 'timesheet',
    table: ReportTable & { truncated?: boolean },
    writer: ReportWriter,
    filters: Record<string, unknown>,
  ): Promise<ReportFile> {
    const content = await writer.write(table);
    const range = `${filters.from}_${filters.to}`;
    await this.audit.record({
      companyId: actor.companyId,
      actorUserId: actor.userId,
      action: 'report.exported',
      entityType: 'Report',
      entityId: report,
      after: {
        format: writer.extension,
        rows: table.rows.length,
        truncated: !!table.truncated,
        filters,
      },
    });
    return {
      filename: `${report === 'attendance' ? 'asistencia' : 'consolidado'}_${range}.${writer.extension}`,
      contentType: writer.contentType,
      content,
    };
  }

  private async subtitle(
    companyId: string,
    company: string,
    from: string,
    to: string,
    storeId?: string,
  ) {
    const store = storeId
      ? await this.repo.storeName(companyId, storeId)
      : null;
    return [
      company,
      `${from} a ${to}`,
      store ?? 'Todos los establecimientos',
    ].join(' · ');
  }

  /** "2026-10-16 20:48 (America/Bogota)" */
  private now(timeZone: string) {
    const now = new Date();
    return `${todayIn(timeZone, now)} ${utcToLocal(now, timeZone).time} (${timeZone})`;
  }
}
