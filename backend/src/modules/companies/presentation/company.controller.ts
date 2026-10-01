import { Body, Controller, Get, Patch } from '@nestjs/common';
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
import { ApiErrors } from '../../../shared/presentation/api-errors.decorator';
import { BEARER_AUTH } from '../../../shared/presentation/swagger';
import { CompanySettingsService } from '../application/company-settings.service';
import {
  CompanyResponseDto,
  UpdateCompanySettingsDto,
} from './dto/company.dto';

@ApiTags('Mi empresa')
@ApiBearerAuth(BEARER_AUTH)
@ApiErrors(401, 403)
@Controller('company')
export class CompanyController {
  constructor(private readonly settings: CompanySettingsService) {}

  @Get()
  @RequirePermissions('companies.read')
  @ApiOperation({ summary: 'Datos y configuración de mi empresa' })
  @ApiOkResponse({ type: CompanyResponseDto })
  get(@CurrentCompanyId() companyId: string) {
    return this.settings.get(companyId);
  }

  @Patch()
  @RequirePermissions('companies.update')
  @ApiOperation({
    summary:
      'Actualizar nombre, zona horaria y valores por defecto de los turnos',
    description:
      'Los datos legales (NIT, país, moneda) solo los cambia el administrador de la plataforma.',
  })
  @ApiOkResponse({ type: CompanyResponseDto })
  @ApiErrors({ 400: 'VALIDATION_ERROR | INVALID_COMPANY_SETTINGS' })
  update(@CurrentActor() actor: Actor, @Body() dto: UpdateCompanySettingsDto) {
    return this.settings.update(actor, dto);
  }
}
