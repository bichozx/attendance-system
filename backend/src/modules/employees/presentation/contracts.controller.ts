import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
import { ContractsService } from '../application/contracts.service';
import {
  ContractResponseDto,
  CreateContractDto,
  CreateContractResponseDto,
  UpdateContractDto,
} from './dto/contract.dto';

@ApiTags('Empleados: contratos')
@ApiBearerAuth(BEARER_AUTH)
@ApiErrors(401, 403)
@Controller('employees/:employeeId/contracts')
export class ContractsController {
  constructor(private readonly contracts: ContractsService) {}

  @Get()
  @RequirePermissions('contracts.read')
  @ApiOperation({ summary: 'Historial de contratos (salario, tipo y jornada)' })
  @ApiOkResponse({ type: [ContractResponseDto] })
  @ApiErrors(400, { 404: 'EMPLOYEE_NOT_FOUND' })
  list(
    @CurrentCompanyId() companyId: string,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
  ) {
    return this.contracts.list(companyId, employeeId);
  }

  @Post()
  @RequirePermissions('contracts.manage')
  @ApiOperation({
    summary: 'Registrar un contrato (o un cambio de condiciones)',
    description:
      'Si hay un contrato vigente que empezó antes, se cierra automáticamente el día anterior. ' +
      'Así un aumento queda como historial, sin sobrescribir el salario anterior.',
  })
  @ApiCreatedResponse({ type: CreateContractResponseDto })
  @ApiErrors(
    { 400: 'VALIDATION_ERROR | INVALID_CONTRACT' },
    {
      404: 'EMPLOYEE_NOT_FOUND',
      409: 'CONTRACT_OVERLAP | EMPLOYEE_NOT_ACTIVE',
    },
  )
  create(
    @CurrentActor() actor: Actor,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Body() dto: CreateContractDto,
  ) {
    return this.contracts.create(actor, employeeId, dto);
  }

  @Patch(':id')
  @RequirePermissions('contracts.manage')
  @ApiOperation({
    summary: 'Corregir notas o la fecha final',
    description: 'El salario y el tipo cambian con un contrato nuevo.',
  })
  @ApiOkResponse({ type: ContractResponseDto })
  @ApiErrors(
    { 400: 'VALIDATION_ERROR | INVALID_CONTRACT' },
    { 404: 'CONTRACT_NOT_FOUND', 409: 'CONTRACT_OVERLAP' },
  )
  update(
    @CurrentActor() actor: Actor,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContractDto,
  ) {
    return this.contracts.update(actor, employeeId, id, dto);
  }
}
