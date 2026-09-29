import {
  Body,
  Controller,
  Get,
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
import { PositionsService } from '../application/positions.service';
import {
  CreatePositionDto,
  ListPositionsQueryDto,
  PositionResponseDto,
  UpdatePositionDto,
} from './dto/employee.dto';

@ApiTags('Cargos')
@ApiBearerAuth(BEARER_AUTH)
@ApiErrors(401, 403)
@Controller('positions')
export class PositionsController {
  constructor(private readonly positions: PositionsService) {}

  @Get()
  @RequirePermissions('employees.read')
  @ApiOperation({ summary: 'Listar cargos' })
  @ApiOkResponse({ type: [PositionResponseDto] })
  list(
    @CurrentCompanyId() companyId: string,
    @Query() query: ListPositionsQueryDto,
  ) {
    return this.positions.list(companyId, query.includeInactive ?? false);
  }

  @Post()
  @RequirePermissions('employees.manage')
  @ApiOperation({ summary: 'Crear un cargo' })
  @ApiCreatedResponse({ type: PositionResponseDto })
  @ApiErrors(400, { 409: 'POSITION_NAME_TAKEN' })
  create(@CurrentActor() actor: Actor, @Body() dto: CreatePositionDto) {
    return this.positions.create(actor, {
      name: dto.name,
      description: dto.description ?? null,
    });
  }

  @Patch(':id')
  @RequirePermissions('employees.manage')
  @ApiOperation({ summary: 'Editar o desactivar un cargo' })
  @ApiOkResponse({ type: PositionResponseDto })
  @ApiErrors(400, { 404: 'POSITION_NOT_FOUND', 409: 'POSITION_NAME_TAKEN' })
  update(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePositionDto,
  ) {
    return this.positions.update(actor, id, dto);
  }
}
