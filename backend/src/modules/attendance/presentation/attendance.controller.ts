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
import { AttendanceQueriesService } from '../application/attendance-queries.service';
import { AttendanceReviewService } from '../application/attendance-review.service';
import { AttendancePresenter } from './attendance.presenter';

import {
  AdjustAttendanceDto,
  AttendanceDetailResponseDto,
  AttendanceResponseDto,
  ListAttendanceQueryDto,
  ReviewAttendanceDto,
} from './dto/attendance.dto';
import { assertRange } from '../../../shared/presentation/date-range';

const toDate = (v: string | null | undefined) =>
  v === undefined ? undefined : v === null ? null : new Date(v);

@ApiTags('Asistencia (supervisión)')
@ApiBearerAuth(BEARER_AUTH)
@ApiErrors(401, 403)
@Controller('attendance')
export class AttendanceController {
  constructor(
    private readonly queries: AttendanceQueriesService,
    private readonly review: AttendanceReviewService,
  ) {}

  @Get()
  @RequirePermissions('attendance.read')
  @ApiOperation({
    summary: 'Asistencia por rango de fechas',
    description:
      'Con `needsReview=true` funciona como bandeja de pendientes del supervisor.',
  })
  @ApiPaginatedResponse(AttendanceResponseDto)
  @ApiErrors({ 400: 'VALIDATION_ERROR | INVALID_DATE_RANGE' })
  async list(
    @CurrentCompanyId() companyId: string,
    @Query() q: ListAttendanceQueryDto,
  ) {
    assertRange(q.from, q.to);
    const page = await this.queries.list(
      companyId,
      {
        from: parseDateOnly(q.from),
        to: parseDateOnly(q.to),
        employeeId: q.employeeId,
        storeId: q.storeId,
        status: q.status,
        needsReview: q.needsReview,
      },
      q.toPageRequest(),
    );
    return { ...page, items: page.items.map(AttendancePresenter.item) };
  }

  @Get(':id')
  @RequirePermissions('attendance.read')
  @ApiOperation({
    summary: 'Detalle con todos los eventos (incluye intentos rechazados)',
  })
  @ApiOkResponse({ type: AttendanceDetailResponseDto })
  @ApiErrors(400, { 404: 'ATTENDANCE_NOT_FOUND' })
  async detail(
    @CurrentCompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return AttendancePresenter.detail(await this.queries.detail(companyId, id));
  }

  @Post(':id/adjust')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('attendance.adjust')
  @ApiOperation({
    summary: 'Ajuste manual de entrada o salida',
    description:
      'Recalcula los minutos, marca la jornada como revisada y deja un evento ' +
      'MANUAL_ADJUSTMENT con el motivo y los valores anteriores.',
  })
  @ApiOkResponse({ type: AttendanceDetailResponseDto })
  @ApiErrors(
    { 400: 'VALIDATION_ERROR | INVALID_ADJUSTMENT' },
    { 404: 'ATTENDANCE_NOT_FOUND' },
  )
  async adjust(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdjustAttendanceDto,
  ) {
    const detail = await this.review.adjust(actor, id, {
      clockInAt: toDate(dto.clockInAt),
      clockOutAt: toDate(dto.clockOutAt),
      reason: dto.reason,
    });
    return AttendancePresenter.detail(detail);
  }

  @Post(':id/review')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('attendance.adjust')
  @ApiOperation({ summary: 'Marcar como revisada sin cambios' })
  @ApiOkResponse({ type: AttendanceDetailResponseDto })
  @ApiErrors(400, { 404: 'ATTENDANCE_NOT_FOUND' })
  async markReviewed(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewAttendanceDto,
  ) {
    return AttendancePresenter.detail(
      await this.review.markReviewed(actor, id, dto.notes ?? null),
    );
  }
}
