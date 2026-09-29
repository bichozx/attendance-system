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
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Actor } from '../../../shared/application/audit-log';
import { CurrentActor } from '../../../shared/auth/current-actor.decorator';
import { CurrentCompanyId } from '../../../shared/auth/current-company.decorator';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { ApiErrors } from '../../../shared/presentation/api-errors.decorator';
import { BEARER_AUTH } from '../../../shared/presentation/swagger';
import { ShiftsService } from '../application/shifts.service';
import {
  AssignEmployeesDto,
  BulkCreateResponseDto,
  BulkCreateShiftsDto,
  CancelShiftDto,
  CreateShiftDto,
  ListShiftsQueryDto,
  ShiftResponseDto,
  UnassignQueryDto,
  UpdateShiftDto,
} from './dto/shift.dto';
import { ShiftPresenter } from './shift.presenter';

const CREATE_ERRORS = [
  {
    400: 'VALIDATION_ERROR | INVALID_SHIFT_TIMING | SHIFT_OUTSIDE_PERIOD | SHIFT_STORE_MISMATCH',
  },
  {
    404: 'STORE_NOT_FOUND | SCHEDULE_PERIOD_NOT_FOUND',
    409: 'SCHEDULE_CONFLICT | EMPLOYEES_NOT_AVAILABLE | STORE_INACTIVE | SCHEDULE_PERIOD_STATUS',
  },
] as const;

@ApiTags('Turnos')
@ApiBearerAuth(BEARER_AUTH)
@ApiErrors(401, 403)
@Controller('shifts')
export class ShiftsController {
  constructor(private readonly shifts: ShiftsService) {}

  @Get()
  @RequirePermissions('shifts.read')
  @ApiOperation({
    summary: 'Calendario de turnos',
    description: 'Rango en fechas locales de la empresa, máximo 62 días.',
  })
  @ApiOkResponse({ type: [ShiftResponseDto] })
  @ApiErrors({ 400: 'VALIDATION_ERROR | INVALID_PERIOD_DATES' })
  async list(
    @CurrentCompanyId() companyId: string,
    @Query() q: ListShiftsQueryDto,
  ) {
    const range = await this.shifts.resolveRange(companyId, q.from, q.to);
    const shifts = await this.shifts.list(companyId, {
      ...range,
      storeId: q.storeId,
      employeeId: q.employeeId,
      schedulePeriodId: q.schedulePeriodId,
      status: q.status,
    });
    return shifts.map(ShiftPresenter.shift);
  }

  @Get(':id')
  @RequirePermissions('shifts.read')
  @ApiOperation({ summary: 'Detalle de un turno con su ventana de marcación' })
  @ApiOkResponse({ type: ShiftResponseDto })
  @ApiErrors(400, { 404: 'SHIFT_NOT_FOUND' })
  async get(
    @CurrentCompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return ShiftPresenter.shift(await this.shifts.get(companyId, id));
  }

  @Post()
  @RequirePermissions('shifts.manage')
  @ApiOperation({
    summary: 'Crear un turno (y asignar empleados)',
    description:
      'Horario en hora local del establecimiento. Se valida que ningún empleado ' +
      'quede con turnos cruzados.',
  })
  @ApiCreatedResponse({ type: ShiftResponseDto })
  @ApiErrors(...CREATE_ERRORS)
  async create(@CurrentActor() actor: Actor, @Body() dto: CreateShiftDto) {
    const { storeId, schedulePeriodId, ...input } = dto;
    return ShiftPresenter.shift(
      await this.shifts.create(actor, storeId, schedulePeriodId ?? null, input),
    );
  }

  @Post('bulk')
  @RequirePermissions('shifts.manage')
  @ApiOperation({
    summary: 'Crear varios turnos de una vez (todo o nada)',
    description:
      'Pensado para programar una quincena completa desde el panel web.',
  })
  @ApiCreatedResponse({ type: BulkCreateResponseDto })
  @ApiErrors(...CREATE_ERRORS)
  async bulk(@CurrentActor() actor: Actor, @Body() dto: BulkCreateShiftsDto) {
    const ids = await this.shifts.createBatch(actor, {
      storeId: dto.storeId,
      schedulePeriodId: dto.schedulePeriodId ?? null,
      shifts: dto.shifts,
    });
    return { created: ids.length, shiftIds: ids };
  }

  @Patch(':id')
  @RequirePermissions('shifts.manage')
  @ApiOperation({
    summary: 'Cambiar horario o parámetros de marcación',
    description:
      'Si el periodo está publicado, se registra el cambio y se notifica.',
  })
  @ApiOkResponse({ type: ShiftResponseDto })
  @ApiErrors(
    { 400: 'VALIDATION_ERROR | INVALID_SHIFT_TIMING | SHIFT_OUTSIDE_PERIOD' },
    {
      404: 'SHIFT_NOT_FOUND',
      409: 'SCHEDULE_CONFLICT | SHIFT_ALREADY_STARTED | SHIFT_CANCELLED | EMPLOYEES_NOT_AVAILABLE',
    },
  )
  async update(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateShiftDto,
  ) {
    return ShiftPresenter.shift(await this.shifts.update(actor, id, dto));
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('shifts.manage')
  @ApiOperation({ summary: 'Cancelar un turno (queda en el historial)' })
  @ApiOkResponse({ type: ShiftResponseDto })
  @ApiErrors(400, {
    404: 'SHIFT_NOT_FOUND',
    409: 'SHIFT_ALREADY_STARTED | SHIFT_CANCELLED',
  })
  async cancel(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelShiftDto,
  ) {
    return ShiftPresenter.shift(
      await this.shifts.cancel(actor, id, dto.reason ?? null),
    );
  }

  @Post(':id/assignments')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('shifts.manage')
  @ApiOperation({ summary: 'Asignar empleados a un turno' })
  @ApiOkResponse({ type: ShiftResponseDto })
  @ApiErrors(400, {
    404: 'SHIFT_NOT_FOUND',
    409: 'SCHEDULE_CONFLICT | EMPLOYEES_NOT_AVAILABLE | SHIFT_ALREADY_STARTED | SHIFT_CANCELLED',
  })
  async assign(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignEmployeesDto,
  ) {
    return ShiftPresenter.shift(
      await this.shifts.assign(actor, id, dto.employeeIds),
    );
  }

  @Delete(':id/assignments/:employeeId')
  @RequirePermissions('shifts.manage')
  @ApiOperation({ summary: 'Retirar a un empleado del turno' })
  @ApiOkResponse({ type: ShiftResponseDto })
  @ApiErrors(400, {
    404: 'SHIFT_NOT_FOUND | ASSIGNMENT_NOT_FOUND',
    409: 'SHIFT_ALREADY_STARTED | SHIFT_CANCELLED',
  })
  async unassign(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Query() q: UnassignQueryDto,
  ) {
    return ShiftPresenter.shift(
      await this.shifts.unassign(actor, id, employeeId, q.reason ?? null),
    );
  }
}
