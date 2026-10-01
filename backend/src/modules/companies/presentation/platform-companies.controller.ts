import {
  Body,
  Controller,
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
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../../shared/auth/authenticated-user';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { PlatformAdminOnly } from '../../../shared/auth/platform-admin.decorator';
import { ApiErrors } from '../../../shared/presentation/api-errors.decorator';
import { ApiPaginatedResponse } from '../../../shared/presentation/api-paginated-response.decorator';
import { BEARER_AUTH } from '../../../shared/presentation/swagger';
import { PlatformCompaniesService } from '../application/platform-companies.service';
import {
  ChangeCompanyStatusDto,
  CreateCompanyDto,
  ListCompaniesQueryDto,
  PlatformCompanyDetailDto,
  PlatformCompanyResponseDto,
  UpdatePlatformCompanyDto,
} from './dto/company.dto';

@ApiTags('Plataforma (superadmin)')
@ApiBearerAuth(BEARER_AUTH)
@ApiErrors(401, { 403: 'Solo el administrador de la plataforma' })
@PlatformAdminOnly()
@Controller('platform/companies')
export class PlatformCompaniesController {
  constructor(private readonly companies: PlatformCompaniesService) {}

  @Get()
  @ApiOperation({ summary: 'Empresas clientes' })
  @ApiPaginatedResponse(PlatformCompanyResponseDto)
  @ApiErrors(400)
  list(@Query() q: ListCompaniesQueryDto) {
    return this.companies.list(
      { search: q.search, status: q.status },
      q.toPageRequest(),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle con cifras y administradores' })
  @ApiOkResponse({ type: PlatformCompanyDetailDto })
  @ApiErrors(400, { 404: 'COMPANY_NOT_FOUND' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.companies.get(id);
  }

  @Post()
  @ApiOperation({
    summary: 'Dar de alta una empresa con su primer administrador',
    description:
      'Si el correo no tiene cuenta, se crea y recibe un enlace de bienvenida (72 h) para crear ' +
      'su contraseña: nadie más la conoce. Si ya tiene cuenta, solo se le agrega la empresa.',
  })
  @ApiCreatedResponse({ type: PlatformCompanyDetailDto })
  @ApiErrors(
    { 400: 'VALIDATION_ERROR | INVALID_COMPANY_SETTINGS' },
    { 409: 'COMPANY_SLUG_TAKEN | COMPANY_TAX_ID_TAKEN' },
  )
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCompanyDto,
  ) {
    return this.companies.create(user.userId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Corregir datos, incluidos los legales' })
  @ApiOkResponse({ type: PlatformCompanyDetailDto })
  @ApiErrors(
    { 400: 'VALIDATION_ERROR | INVALID_COMPANY_SETTINGS' },
    {
      404: 'COMPANY_NOT_FOUND',
      409: 'COMPANY_SLUG_TAKEN | COMPANY_TAX_ID_TAKEN',
    },
  )
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePlatformCompanyDto,
  ) {
    return this.companies.update(user.userId, id, dto);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Activar, suspender o cancelar',
    description:
      'Suspender/cancelar cierra todas las sesiones de la empresa. No borra datos.',
  })
  @ApiOkResponse({ type: PlatformCompanyDetailDto })
  @ApiErrors(400, { 404: 'COMPANY_NOT_FOUND' })
  changeStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeCompanyStatusDto,
  ) {
    return this.companies.changeStatus(
      user.userId,
      id,
      dto.status,
      dto.reason ?? null,
    );
  }

  @Post(':id/admins/:userId/invitation')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Reenviar la invitación a un administrador' })
  @ApiAcceptedResponse({ description: 'Invitación enviada' })
  @ApiErrors(400, { 404: 'COMPANY_NOT_FOUND | COMPANY_ADMIN_NOT_FOUND' })
  async resendInvitation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    await this.companies.resendInvitation(user.userId, id, userId);
    return { message: 'Se reenvió la invitación.' };
  }
}
