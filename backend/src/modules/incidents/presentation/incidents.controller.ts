import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Actor } from '../../../shared/application/audit-log';
import { CurrentActor } from '../../../shared/auth/current-actor.decorator';
import { CurrentCompanyId } from '../../../shared/auth/current-company.decorator';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { parseDateOnly } from '../../../shared/domain/date-only';
import { ApiErrors } from '../../../shared/presentation/api-errors.decorator';
import { ApiPaginatedResponse } from '../../../shared/presentation/api-paginated-response.decorator';
import { BEARER_AUTH } from '../../../shared/presentation/swagger';
import {
  IncidentInput,
  IncidentsService,
} from '../application/incidents.service';
import { TimesheetService } from '../application/timesheet.service';
import {
  ApproveIncidentDto,
  ApproveResponseDto,
  IncidentResponseDto,
  ListIncidentsQueryDto,
  RegisterIncidentDto,
  RequestIncidentDto,
  ResolveNotesDto,
  TimesheetQueryDto,
  TimesheetResponseDto,
} from './dto/incident.dto';
import { IncidentPresenter } from './incident.presenter';

export function toInput(dto: RequestIncidentDto): IncidentInput {
  return {
    ...dto,
    clockInAt: dto.clockInAt ? new Date(dto.clockInAt) : undefined,
    clockOutAt: dto.clockOutAt ? new Date(dto.clockOutAt) : undefined,
  };
}

const toFilter = (q: ListIncidentsQueryDto) => ({
  from: q.from ? parseDateOnly(q.from) : undefined,
  to: q.to ? new Date(parseDateOnly(q.to).getTime() + 86_400_000) : undefined,
  employeeId: q.employeeId,
  type: q.type,
  status: q.status,
});

const CREATE_ERRORS = [
  { 400: 'VALIDATION_ERROR | INVALID_INCIDENT' },
  { 404: 'ATTENDANCE_NOT_FOUND', 409: 'INCIDENT_DUPLICATE | TIME_OFF_OVERLAP' },
] as const;

@ApiTags('Novedades (supervisión)')
@ApiBearerAuth(BEARER_AUTH)
@ApiErrors(401, 403)
@Controller('incidents')
export class IncidentsController {
  constructor(private readonly incidents: IncidentsService) {}

  @Get()
  @RequirePermissions('incidents.read')
  @ApiOperation({
    summary: 'Novedades de la empresa',
    description: 'Con `status=PENDING` es la bandeja de aprobación.',
  })
  @ApiPaginatedResponse(IncidentResponseDto)
  @ApiErrors(400)
  async list(
    @CurrentCompanyId() companyId: string,
    @Query() q: ListIncidentsQueryDto,
  ) {
    const page = await this.incidents.list(
      companyId,
      toFilter(q),
      q.toPageRequest(),
    );
    return { ...page, items: page.items.map(IncidentPresenter.incident) };
  }

  @Get(':id')
  @RequirePermissions('incidents.read')
  @ApiOperation({ summary: 'Detalle de una novedad' })
  @ApiOkResponse({ type: IncidentResponseDto })
  @ApiErrors(400, { 404: 'INCIDENT_NOT_FOUND' })
  async get(
    @CurrentCompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return IncidentPresenter.incident(await this.incidents.get(companyId, id));
  }

  @Post()
  @RequirePermissions('incidents.approve')
  @ApiOperation({
    summary: 'Registrar una novedad de un empleado (queda aprobada)',
    description:
      'Ej. incapacidad entregada en papel. Aplica sus efectos de inmediato.',
  })
  @ApiCreatedResponse({ type: ApproveResponseDto })
  @ApiErrors(...CREATE_ERRORS, { 403: 'SELF_APPROVAL_FORBIDDEN' })
  async register(
    @CurrentActor() actor: Actor,
    @Body() dto: RegisterIncidentDto,
  ) {
    const { employeeId, ...rest } = dto;
    return this.approvalResponse(
      await this.incidents.registerApproved(actor, employeeId, toInput(rest)),
    );
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('incidents.approve')
  @ApiOperation({
    summary: 'Aprobar',
    description:
      'Olvido de marcación: corrige la asistencia. Incapacidad/permiso: justifica ausencias y ' +
      'devuelve los turnos futuros afectados. Horas extra: se puede aprobar menos de lo pedido.',
  })
  @ApiOkResponse({ type: ApproveResponseDto })
  @ApiErrors(
    { 400: 'VALIDATION_ERROR | INVALID_INCIDENT | INVALID_ADJUSTMENT' },
    {
      403: 'SELF_APPROVAL_FORBIDDEN',
      404: 'INCIDENT_NOT_FOUND',
      409: 'INCIDENT_STATUS',
    },
  )
  async approve(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveIncidentDto,
  ) {
    return this.approvalResponse(await this.incidents.approve(actor, id, dto));
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('incidents.approve')
  @ApiOperation({ summary: 'Rechazar (con nota para el empleado)' })
  @ApiOkResponse({ type: IncidentResponseDto })
  @ApiErrors(400, {
    403: 'SELF_APPROVAL_FORBIDDEN',
    404: 'INCIDENT_NOT_FOUND',
    409: 'INCIDENT_STATUS',
  })
  async reject(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveNotesDto,
  ) {
    return IncidentPresenter.incident(
      await this.incidents.reject(actor, id, dto.notes),
    );
  }

  @Post(':id/revoke')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('incidents.approve')
  @ApiOperation({ summary: 'Anular una novedad aprobada' })
  @ApiOkResponse({ type: IncidentResponseDto })
  @ApiErrors(400, { 404: 'INCIDENT_NOT_FOUND', 409: 'INCIDENT_STATUS' })
  async revoke(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveNotesDto,
  ) {
    return IncidentPresenter.incident(
      await this.incidents.revoke(actor, id, dto.notes),
    );
  }

  private approvalResponse(
    r: Awaited<ReturnType<IncidentsService['approve']>>,
  ) {
    return {
      incident: IncidentPresenter.incident(r.incident),
      affectedShifts: r.affectedShifts.map(IncidentPresenter.affected),
    };
  }
}

@ApiTags('Mis novedades (app móvil)')
@ApiBearerAuth(BEARER_AUTH)
@ApiErrors(401, 403)
@Controller('me/incidents')
export class MyIncidentsController {
  constructor(private readonly incidents: IncidentsService) {}

  @Get()
  @RequirePermissions('incidents.read_own')
  @ApiOperation({ summary: 'Mis novedades' })
  @ApiPaginatedResponse(IncidentResponseDto)
  @ApiErrors({ 400: 'VALIDATION_ERROR', 403: 'NOT_AN_EMPLOYEE' })
  async list(@CurrentActor() actor: Actor, @Query() q: ListIncidentsQueryDto) {
    const page = await this.incidents.myList(
      actor,
      { ...toFilter(q), employeeId: undefined },
      q.toPageRequest(),
    );
    return { ...page, items: page.items.map(IncidentPresenter.incident) };
  }

  @Post()
  @RequirePermissions('incidents.request')
  @ApiOperation({
    summary: 'Reportar una novedad (queda pendiente de aprobación)',
  })
  @ApiCreatedResponse({ type: IncidentResponseDto })
  @ApiErrors(...CREATE_ERRORS, { 403: 'NOT_AN_EMPLOYEE' })
  async request(@CurrentActor() actor: Actor, @Body() dto: RequestIncidentDto) {
    return IncidentPresenter.incident(
      await this.incidents.request(actor, toInput(dto)),
    );
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('incidents.request')
  @ApiOperation({ summary: 'Retirar mi solicitud pendiente' })
  @ApiOkResponse({ type: IncidentResponseDto })
  @ApiErrors(400, { 404: 'INCIDENT_NOT_FOUND', 409: 'INCIDENT_STATUS' })
  async cancel(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return IncidentPresenter.incident(
      await this.incidents.cancelOwn(actor, id),
    );
  }
}

@ApiTags('Consolidado para nómina')
@ApiBearerAuth(BEARER_AUTH)
@ApiErrors(401, 403)
@Controller('timesheets')
export class TimesheetsController {
  constructor(private readonly timesheets: TimesheetService) {}

  @Get()
  @RequirePermissions('reports.read')
  @ApiOperation({
    summary: 'Consolidado por empleado',
    description:
      'Cruza la asistencia registrada con las novedades aprobadas: tardanza justificada vs. ' +
      'injustificada, horas extra aprobadas vs. pendientes, ausencias justificadas, días de ' +
      'incapacidad y minutos de permiso. No modifica la asistencia.',
  })
  @ApiOkResponse({ type: TimesheetResponseDto })
  @ApiErrors({ 400: 'VALIDATION_ERROR | INVALID_DATE_RANGE' })
  build(@CurrentCompanyId() companyId: string, @Query() q: TimesheetQueryDto) {
    return this.timesheets.build(companyId, q.from, q.to, {
      employeeId: q.employeeId,
      storeId: q.storeId,
    });
  }
}
