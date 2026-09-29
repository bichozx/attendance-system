import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Actor } from '../../../shared/application/audit-log';
import { CurrentActor } from '../../../shared/auth/current-actor.decorator';
import { CurrentCompanyId } from '../../../shared/auth/current-company.decorator';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { ApiErrors } from '../../../shared/presentation/api-errors.decorator';
import { ApiPaginatedResponse } from '../../../shared/presentation/api-paginated-response.decorator';
import { BEARER_AUTH } from '../../../shared/presentation/swagger';
import { SchedulePeriodsService } from '../application/schedule-periods.service';
import {
  CreatePeriodDto,
  ListPeriodsQueryDto,
  PeriodResponseDto,
  UpdatePeriodDto,
} from './dto/shift.dto';
import { ShiftPresenter } from './shift.presenter';

@ApiTags('Programación (periodos)')
@ApiBearerAuth(BEARER_AUTH)
@ApiErrors(401, 403)
@Controller('schedule-periods')
export class SchedulePeriodsController {
  constructor(private readonly periods: SchedulePeriodsService) {}

  @Get()
  @RequirePermissions('shifts.read')
  @ApiOperation({ summary: 'Listar periodos de programación' })
  @ApiPaginatedResponse(PeriodResponseDto)
  @ApiErrors(400)
  async list(
    @CurrentCompanyId() companyId: string,
    @Query() q: ListPeriodsQueryDto,
  ) {
    const page = await this.periods.list(
      companyId,
      { status: q.status, storeId: q.storeId },
      q.toPageRequest(),
    );
    return { ...page, items: page.items.map(ShiftPresenter.period) };
  }

  @Get(':id')
  @RequirePermissions('shifts.read')
  @ApiOperation({ summary: 'Detalle de un periodo' })
  @ApiOkResponse({ type: PeriodResponseDto })
  @ApiErrors(400, { 404: 'SCHEDULE_PERIOD_NOT_FOUND' })
  async get(
    @CurrentCompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return ShiftPresenter.period(await this.periods.get(companyId, id));
  }

  @Post()
  @RequirePermissions('shifts.manage')
  @ApiOperation({
    summary: 'Crear un periodo (borrador)',
    description:
      'Máximo 31 días. No puede cruzarse con otro periodo del mismo establecimiento ' +
      'ni con uno de toda la empresa.',
  })
  @ApiCreatedResponse({ type: PeriodResponseDto })
  @ApiErrors(
    { 400: 'VALIDATION_ERROR | INVALID_PERIOD_DATES' },
    { 404: 'STORE_NOT_FOUND', 409: 'SCHEDULE_PERIOD_OVERLAP' },
  )
  async create(@CurrentActor() actor: Actor, @Body() dto: CreatePeriodDto) {
    const period = await this.periods.create(actor, {
      storeId: dto.storeId ?? null,
      name: dto.name,
      startDate: dto.startDate,
      endDate: dto.endDate,
    });
    return ShiftPresenter.period(period);
  }

  @Patch(':id')
  @RequirePermissions('shifts.manage')
  @ApiOperation({
    summary:
      'Renombrar o cambiar fechas (fechas solo en borradores sin turnos)',
  })
  @ApiOkResponse({ type: PeriodResponseDto })
  @ApiErrors(
    { 400: 'VALIDATION_ERROR | INVALID_PERIOD_DATES' },
    {
      404: 'SCHEDULE_PERIOD_NOT_FOUND',
      409: 'SCHEDULE_PERIOD_STATUS | SCHEDULE_PERIOD_OVERLAP',
    },
  )
  async update(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePeriodDto,
  ) {
    return ShiftPresenter.period(await this.periods.update(actor, id, dto));
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('shifts.publish')
  @ApiOperation({
    summary: 'Publicar (borrador → publicado)',
    description:
      'Los empleados empiezan a ver sus turnos y reciben una notificación. ' +
      'Desde aquí, cada cambio queda registrado y se notifica al afectado.',
  })
  @ApiOkResponse({ type: PeriodResponseDto })
  @ApiErrors(400, {
    404: 'SCHEDULE_PERIOD_NOT_FOUND',
    409: 'SCHEDULE_PERIOD_STATUS',
  })
  async publish(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return ShiftPresenter.period(await this.periods.publish(actor, id));
  }

  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('shifts.publish')
  @ApiOperation({ summary: 'Cerrar un periodo terminado (queda congelado)' })
  @ApiOkResponse({ type: PeriodResponseDto })
  @ApiErrors(400, {
    404: 'SCHEDULE_PERIOD_NOT_FOUND',
    409: 'SCHEDULE_PERIOD_STATUS',
  })
  async close(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return ShiftPresenter.period(await this.periods.close(actor, id));
  }

  @Delete(':id')
  @RequirePermissions('shifts.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar un borrador con todos sus turnos' })
  @ApiNoContentResponse({ description: 'Periodo eliminado' })
  @ApiErrors(400, {
    404: 'SCHEDULE_PERIOD_NOT_FOUND',
    409: 'SCHEDULE_PERIOD_STATUS',
  })
  delete(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.periods.delete(actor, id);
  }
}
