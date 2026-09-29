import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Actor } from '../../../shared/application/audit-log';
import { CurrentActor } from '../../../shared/auth/current-actor.decorator';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { ApiErrors } from '../../../shared/presentation/api-errors.decorator';
import { BEARER_AUTH } from '../../../shared/presentation/swagger';
import { ShiftsService } from '../application/shifts.service';
import { DateRangeQueryDto, MyShiftsResponseDto } from './dto/shift.dto';
import { ShiftPresenter } from './shift.presenter';

@ApiTags('Mis turnos (app móvil)')
@ApiBearerAuth(BEARER_AUTH)
@ApiErrors(401, 403)
@Controller('me/shifts')
export class MyShiftsController {
  constructor(private readonly shifts: ShiftsService) {}

  @Get()
  @RequirePermissions('shifts.read_own')
  @ApiOperation({
    summary: 'Mis turnos',
    description:
      'Solo turnos de periodos publicados. Incluye cancelados para que el empleado vea el cambio.',
  })
  @ApiOkResponse({ type: MyShiftsResponseDto })
  @ApiErrors({ 400: 'VALIDATION_ERROR | INVALID_PERIOD_DATES' })
  async list(@CurrentActor() actor: Actor, @Query() q: DateRangeQueryDto) {
    const range = await this.shifts.resolveRange(actor.companyId, q.from, q.to);
    const { employeeId, shifts } = await this.shifts.myShifts(
      actor.companyId,
      actor.userId,
      range.from,
      range.to,
    );
    return {
      employeeId,
      shifts: employeeId
        ? shifts.map((s) => ShiftPresenter.myShift(s, employeeId))
        : [],
    };
  }
}
