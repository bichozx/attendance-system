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
import type { Page } from '../../../shared/application/page';
import type { ShiftChangeView } from '../domain/shift-change.repository';
import { CurrentActor } from '../../../shared/auth/current-actor.decorator';
import { CurrentCompanyId } from '../../../shared/auth/current-company.decorator';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { ApiErrors } from '../../../shared/presentation/api-errors.decorator';
import { ApiPaginatedResponse } from '../../../shared/presentation/api-paginated-response.decorator';
import { BEARER_AUTH } from '../../../shared/presentation/swagger';
import { ShiftChangeRequestsService } from '../application/shift-change-requests.service';
import {
  ApproveShiftChangeDto,
  ChangeOptionsResponseDto,
  CreateShiftChangeDto,
  ListShiftChangesQueryDto,
  OptionsQueryDto,
  RejectShiftChangeDto,
  RespondShiftChangeDto,
  ShiftChangeResponseDto,
} from './dto/shift-change.dto';
import { ShiftChangePresenter } from './shift-change.presenter';

const page = (p: Page<ShiftChangeView>) => ({
  ...p,
  items: p.items.map(ShiftChangePresenter.view),
});

@ApiTags('Mis cambios de turno (app móvil)')
@ApiBearerAuth(BEARER_AUTH)
@ApiErrors(401, { 403: 'FORBIDDEN | NOT_AN_EMPLOYEE' })
@Controller('me/shift-changes')
export class MyShiftChangesController {
  constructor(private readonly changes: ShiftChangeRequestsService) {}

  @Get('options')
  @RequirePermissions('shift_changes.request')
  @ApiOperation({
    summary: '¿Con quién puedo cambiar este turno?',
    description:
      'Compañeros que pueden cubrirlo y turnos de compañeros (próximos 14 días) que puedes ' +
      'intercambiar. Ya filtrados por disponibilidad, incapacidades y cruces de horario. ' +
      'Solo se muestran nombres y horarios.',
  })
  @ApiOkResponse({ type: ChangeOptionsResponseDto })
  @ApiErrors({
    400: 'VALIDATION_ERROR | INVALID_SHIFT_CHANGE',
    409: 'SHIFT_CHANGE_TOO_LATE',
  })
  async options(@CurrentActor() actor: Actor, @Query() q: OptionsQueryDto) {
    const [cover, swap] = await Promise.all([
      this.changes.coverCandidates(actor, q.shiftId),
      this.changes.swapOptions(actor, q.shiftId),
    ]);
    return {
      cover,
      swap: swap.map((o) => ({
        coworker: o.coworker,
        shift: ShiftChangePresenter.shift(o.shift),
      })),
    };
  }

  @Get()
  @RequirePermissions('shift_changes.request')
  @ApiOperation({
    summary: 'Mis solicitudes (las que pedí y las que me piden)',
  })
  @ApiPaginatedResponse(ShiftChangeResponseDto)
  @ApiErrors(400)
  async list(
    @CurrentActor() actor: Actor,
    @Query() q: ListShiftChangesQueryDto,
  ) {
    return page(
      await this.changes.myList(actor, { stage: q.stage }, q.toPageRequest()),
    );
  }

  @Post()
  @RequirePermissions('shift_changes.request')
  @ApiOperation({
    summary: 'Pedir que un compañero cubra mi turno, o proponer un intercambio',
  })
  @ApiCreatedResponse({ type: ShiftChangeResponseDto })
  @ApiErrors(
    { 400: 'VALIDATION_ERROR | INVALID_SHIFT_CHANGE' },
    {
      409: 'SHIFT_CHANGE_TOO_LATE | SHIFT_CHANGE_ALREADY_PENDING | SCHEDULE_CONFLICT | EMPLOYEES_NOT_AVAILABLE',
    },
  )
  async create(
    @CurrentActor() actor: Actor,
    @Body() dto: CreateShiftChangeDto,
  ) {
    return ShiftChangePresenter.view(await this.changes.request(actor, dto));
  }

  @Post(':id/respond')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('shift_changes.request')
  @ApiOperation({ summary: 'Aceptar o rechazar lo que me pide un compañero' })
  @ApiOkResponse({ type: ShiftChangeResponseDto })
  @ApiErrors(400, {
    404: 'SHIFT_CHANGE_NOT_FOUND',
    409: 'SHIFT_CHANGE_STATE | SHIFT_CHANGE_TOO_LATE',
  })
  async respond(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RespondShiftChangeDto,
  ) {
    return ShiftChangePresenter.view(
      await this.changes.respond(actor, id, dto.accept, dto.notes ?? null),
    );
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('shift_changes.request')
  @ApiOperation({ summary: 'Retirar mi solicitud' })
  @ApiOkResponse({ type: ShiftChangeResponseDto })
  @ApiErrors(400, { 404: 'SHIFT_CHANGE_NOT_FOUND', 409: 'SHIFT_CHANGE_STATE' })
  async cancel(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return ShiftChangePresenter.view(await this.changes.cancel(actor, id));
  }
}

@ApiTags('Cambios de turno (supervisión)')
@ApiBearerAuth(BEARER_AUTH)
@ApiErrors(401, 403)
@Controller('shift-changes')
export class ShiftChangesController {
  constructor(private readonly changes: ShiftChangeRequestsService) {}

  @Get()
  @RequirePermissions('shift_changes.approve')
  @ApiOperation({
    summary: 'Solicitudes de cambio',
    description: '`stage=AWAITING_APPROVAL` = bandeja del supervisor.',
  })
  @ApiPaginatedResponse(ShiftChangeResponseDto)
  @ApiErrors(400)
  async list(
    @CurrentCompanyId() companyId: string,
    @Query() q: ListShiftChangesQueryDto,
  ) {
    return page(
      await this.changes.list(companyId, { stage: q.stage }, q.toPageRequest()),
    );
  }

  @Get(':id')
  @RequirePermissions('shift_changes.approve')
  @ApiOperation({ summary: 'Detalle de una solicitud' })
  @ApiOkResponse({ type: ShiftChangeResponseDto })
  @ApiErrors(400, { 404: 'SHIFT_CHANGE_NOT_FOUND' })
  async get(
    @CurrentCompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return ShiftChangePresenter.view(await this.changes.get(companyId, id));
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('shift_changes.approve')
  @ApiOperation({
    summary: 'Aprobar (mueve los turnos)',
    description:
      'Revalida todo bajo bloqueo de ambos empleados: si ya no es posible (cruce nuevo, ' +
      'incapacidad, turno movido) no se mueve nada. El intercambio es todo o nada.',
  })
  @ApiOkResponse({ type: ShiftChangeResponseDto })
  @ApiErrors(400, {
    403: 'SELF_APPROVAL_FORBIDDEN',
    404: 'SHIFT_CHANGE_NOT_FOUND',
    409: 'SHIFT_CHANGE_STATE | SCHEDULE_CONFLICT | EMPLOYEES_NOT_AVAILABLE | SHIFT_CHANGE_STALE | SHIFT_CHANGE_TOO_LATE',
  })
  async approve(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveShiftChangeDto,
  ) {
    return ShiftChangePresenter.view(
      await this.changes.approve(actor, id, dto.notes ?? null),
    );
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('shift_changes.approve')
  @ApiOperation({ summary: 'Rechazar (con motivo para ambos)' })
  @ApiOkResponse({ type: ShiftChangeResponseDto })
  @ApiErrors(400, {
    403: 'SELF_APPROVAL_FORBIDDEN',
    404: 'SHIFT_CHANGE_NOT_FOUND',
    409: 'SHIFT_CHANGE_STATE',
  })
  async reject(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectShiftChangeDto,
  ) {
    return ShiftChangePresenter.view(
      await this.changes.reject(actor, id, dto.notes),
    );
  }
}
