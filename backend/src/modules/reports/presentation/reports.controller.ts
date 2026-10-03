import { Controller, Get, Query, Res, StreamableFile } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import type { Actor } from '../../../shared/application/audit-log';
import { CurrentActor } from '../../../shared/auth/current-actor.decorator';
import { CurrentCompanyId } from '../../../shared/auth/current-company.decorator';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { ApiErrors } from '../../../shared/presentation/api-errors.decorator';
import { ApiPaginatedResponse } from '../../../shared/presentation/api-paginated-response.decorator';
import { BEARER_AUTH } from '../../../shared/presentation/swagger';
import { AuditQueryService } from '../application/audit-query.service';
import { DashboardService } from '../application/dashboard.service';
import { ReportFile, ReportsService } from '../application/reports.service';
import { ExcelReportWriter } from '../infrastructure/excel-report.writer';
import { PdfReportWriter } from '../infrastructure/pdf-report.writer';
import {
  AttendanceExportQueryDto,
  AttendanceReportQueryDto,
  AuditItemDto,
  AuditQueryDto,
  DashboardQueryDto,
  DashboardResponseDto,
  ReportTableDto,
  TimesheetExportQueryDto,
} from './dto/report.dto';

const XLSX =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@ApiTags('Reportes')
@ApiBearerAuth(BEARER_AUTH)
@ApiErrors(401, 403)
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly reports: ReportsService,
    private readonly excel: ExcelReportWriter,
    private readonly pdf: PdfReportWriter,
  ) {}

  @Get('dashboard')
  @RequirePermissions('reports.read')
  @ApiOperation({
    summary: 'Cómo va el día (en vivo)',
    description:
      'Por cada persona programada: en turno, completó, por llegar, SIN MARCAR (pasó la ' +
      'tolerancia), SALIDA PENDIENTE, ausente o con incapacidad/permiso. Incluye totales por ' +
      'establecimiento y lo pendiente por aprobar.',
  })
  @ApiOkResponse({ type: DashboardResponseDto })
  @ApiErrors(400)
  getDashboard(
    @CurrentCompanyId() companyId: string,
    @Query() q: DashboardQueryDto,
  ) {
    return this.dashboard.build(companyId, q.date, q.storeId);
  }

  @Get('attendance')
  @RequirePermissions('reports.read')
  @ApiOperation({ summary: 'Detalle de asistencia (vista previa en JSON)' })
  @ApiOkResponse({ type: ReportTableDto })
  @ApiErrors({ 400: 'VALIDATION_ERROR | INVALID_DATE_RANGE' })
  attendance(
    @CurrentCompanyId() companyId: string,
    @Query() q: AttendanceReportQueryDto,
  ) {
    return this.reports.attendanceTable(companyId, q);
  }

  @Get('attendance/export')
  @RequirePermissions('reports.export')
  @ApiOperation({
    summary: 'Descargar el detalle de asistencia en Excel o PDF',
  })
  @ApiProduces(XLSX, 'application/pdf')
  @ApiOkResponse({ description: 'Archivo para descargar' })
  @ApiErrors({ 400: 'VALIDATION_ERROR | INVALID_DATE_RANGE' })
  async exportAttendance(
    @CurrentActor() actor: Actor,
    @Query() q: AttendanceExportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { format, ...filters } = q;
    const table = await this.reports.attendanceTable(actor.companyId, filters);
    return this.send(
      res,
      await this.reports.export(
        actor,
        'attendance',
        table,
        this.writer(format),
        filters,
      ),
    );
  }

  @Get('timesheet/export')
  @RequirePermissions('reports.export')
  @ApiOperation({
    summary: 'Descargar el consolidado para nómina en Excel o PDF',
  })
  @ApiProduces(XLSX, 'application/pdf')
  @ApiOkResponse({ description: 'Archivo para descargar' })
  @ApiErrors({ 400: 'VALIDATION_ERROR | INVALID_DATE_RANGE' })
  async exportTimesheet(
    @CurrentActor() actor: Actor,
    @Query() q: TimesheetExportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { format, ...filters } = q;
    const table = await this.reports.timesheetTable(actor.companyId, filters);
    return this.send(
      res,
      await this.reports.export(
        actor,
        'timesheet',
        table,
        this.writer(format),
        filters,
      ),
    );
  }

  private writer(format: 'xlsx' | 'pdf') {
    return format === 'pdf' ? this.pdf : this.excel;
  }

  private send(res: Response, file: ReportFile) {
    res.set({
      'Content-Type': file.contentType,
      'Content-Disposition': `attachment; filename="${file.filename}"`,
      'Cache-Control': 'no-store',
    });
    return new StreamableFile(file.content);
  }
}

@ApiTags('Auditoría')
@ApiBearerAuth(BEARER_AUTH)
@ApiErrors(401, 403)
@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly audit: AuditQueryService) {}

  @Get()
  @RequirePermissions('audit.read')
  @ApiOperation({
    summary: 'Consultar la auditoría',
    description: 'Quién hizo qué y cuándo, con los valores antes y después.',
  })
  @ApiPaginatedResponse(AuditItemDto)
  @ApiErrors({ 400: 'VALIDATION_ERROR | INVALID_DATE_RANGE' })
  list(@CurrentCompanyId() companyId: string, @Query() q: AuditQueryDto) {
    return this.audit.list(
      companyId,
      {
        from: q.from,
        to: q.to,
        action: q.action,
        entityType: q.entityType,
        entityId: q.entityId,
        actorUserId: q.actorUserId,
      },
      q.toPageRequest(),
    );
  }
}
