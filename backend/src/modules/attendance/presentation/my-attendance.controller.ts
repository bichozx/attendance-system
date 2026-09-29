import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Actor } from '../../../shared/application/audit-log';
import { CurrentActor } from '../../../shared/auth/current-actor.decorator';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { ApiErrors } from '../../../shared/presentation/api-errors.decorator';
import { ApiPaginatedResponse } from '../../../shared/presentation/api-paginated-response.decorator';
import { BEARER_AUTH } from '../../../shared/presentation/swagger';
import { AttendanceQueriesService } from '../application/attendance-queries.service';
import { ClockService } from '../application/clock.service';
import { AttendancePresenter } from './attendance.presenter';

import {
  AttendanceResponseDto,
  ClockInDto,
  ClockOutDto,
  ClockResultDto,
  DateRangeDto,
  MyStatusResponseDto,
  SyncDto,
  SyncResponseDto,
} from './dto/attendance.dto';
import { assertRange } from '../../../shared/presentation/date-range';

const toCommand = (
  type: 'CLOCK_IN' | 'CLOCK_OUT',
  dto: ClockInDto | ClockOutDto,
) => ({
  type,
  fix: {
    latitude: dto.latitude,
    longitude: dto.longitude,
    accuracyMeters: dto.accuracyMeters,
    mocked: dto.mocked,
  },
  shiftId: 'shiftId' in dto ? dto.shiftId : undefined,
  idempotencyKey: dto.idempotencyKey,
  deviceInfo: dto.device ? { ...dto.device } : undefined,
});

@ApiTags('Mi asistencia (app móvil)')
@ApiBearerAuth(BEARER_AUTH)
@ApiErrors(401, 403)
@Controller('me/attendance')
export class MyAttendanceController {
  constructor(
    private readonly clockService: ClockService,
    private readonly queries: AttendanceQueriesService,
  ) {}

  @Get('status')
  @RequirePermissions('attendance.read_own')
  @ApiOperation({
    summary: 'Estado actual: jornada abierta y próximo turno',
    description:
      'Para la pantalla principal de la app. Incluye la hora del servidor.',
  })
  @ApiOkResponse({ type: MyStatusResponseDto })
  @ApiErrors({ 403: 'NOT_AN_EMPLOYEE' })
  async status(@CurrentActor() actor: Actor) {
    const s = await this.queries.myStatus(actor);
    return {
      ...s,
      openAttendance: s.openAttendance && {
        ...s.openAttendance,
        shift: AttendancePresenter.shift(s.openAttendance.shift),
      },
      nextShift: s.nextShift && {
        ...s.nextShift,
        shift: AttendancePresenter.shift(s.nextShift.shift),
      },
    };
  }

  @Get()
  @RequirePermissions('attendance.read_own')
  @ApiOperation({ summary: 'Mi historial de asistencia' })
  @ApiPaginatedResponse(AttendanceResponseDto)
  @ApiErrors({
    400: 'VALIDATION_ERROR | INVALID_DATE_RANGE',
    403: 'NOT_AN_EMPLOYEE',
  })
  async history(@CurrentActor() actor: Actor, @Query() q: DateRangeDto) {
    assertRange(q.from, q.to);
    const page = await this.queries.myHistory(
      actor,
      q.from,
      q.to,
      q.toPageRequest(),
    );
    return { ...page, items: page.items.map(AttendancePresenter.item) };
  }

  @Post('clock-in')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @RequirePermissions('attendance.clock')
  @ApiOperation({
    summary: 'Marcar entrada',
    description:
      'Siempre responde 200: revise `accepted`. Los intentos rechazados también quedan ' +
      'registrados (evidencia). La hora oficial es la del servidor.',
  })
  @ApiOkResponse({ type: ClockResultDto })
  @ApiErrors(400, { 403: 'NOT_AN_EMPLOYEE', 409: 'IDEMPOTENCY_KEY_REUSED' })
  clockIn(@CurrentActor() actor: Actor, @Body() dto: ClockInDto) {
    return this.clockService.clock(actor, toCommand('CLOCK_IN', dto));
  }

  @Post('clock-out')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @RequirePermissions('attendance.clock')
  @ApiOperation({
    summary: 'Marcar salida',
    description: 'Siempre responde 200: revise `accepted`.',
  })
  @ApiOkResponse({ type: ClockResultDto })
  @ApiErrors(400, { 403: 'NOT_AN_EMPLOYEE', 409: 'IDEMPOTENCY_KEY_REUSED' })
  clockOut(@CurrentActor() actor: Actor, @Body() dto: ClockOutDto) {
    return this.clockService.clock(actor, toCommand('CLOCK_OUT', dto));
  }

  @Post('sync')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @RequirePermissions('attendance.clock')
  @ApiOperation({
    summary: 'Sincronizar marcaciones hechas sin conexión',
    description:
      'Hasta 20 eventos. El servidor corrige la hora de cada uno con el desfase del reloj ' +
      'del teléfono (deviceNow) y aplica las mismas reglas de turno y geocerca. ' +
      'Es seguro reenviar: la idempotencyKey evita duplicados.',
  })
  @ApiOkResponse({ type: SyncResponseDto })
  @ApiErrors(400, { 403: 'NOT_AN_EMPLOYEE' })
  sync(@CurrentActor() actor: Actor, @Body() dto: SyncDto) {
    return this.clockService.sync(
      actor,
      new Date(dto.deviceNow),
      dto.events.map((e) => ({
        ...toCommand(e.type, e),
        clientTimestamp: new Date(e.clientTimestamp),
      })),
    );
  }
}
