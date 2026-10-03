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
import type { Actor } from '../../../shared/application/audit-log';
import { CurrentActor } from '../../../shared/auth/current-actor.decorator';
import { CurrentCompanyId } from '../../../shared/auth/current-company.decorator';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { ApiErrors } from '../../../shared/presentation/api-errors.decorator';
import { ApiPaginatedResponse } from '../../../shared/presentation/api-paginated-response.decorator';
import { BEARER_AUTH } from '../../../shared/presentation/swagger';
import { PasswordRecoveryService } from '../../auth/application/use-cases/password-recovery.service';
import { CompanyUsersService } from '../application/company-users.service';
import {
  ChangeUserRoleDto,
  ChangeUserStatusDto,
  CompanyUserResponseDto,
  CreateUserDto,
  CreateUserResponseDto,
  ListUsersQueryDto,
} from './dto/user.dto';

@ApiTags('Usuarios')
@ApiBearerAuth(BEARER_AUTH)
@ApiErrors(401, 403)
@Controller('users')
export class UsersController {
  constructor(
    private readonly users: CompanyUsersService,
    private readonly recovery: PasswordRecoveryService,
  ) {}

  @Get()
  @RequirePermissions('users.read')
  @ApiOperation({ summary: 'Usuarios con acceso a la empresa' })
  @ApiPaginatedResponse(CompanyUserResponseDto)
  @ApiErrors(400)
  list(
    @CurrentCompanyId() companyId: string,
    @Query() query: ListUsersQueryDto,
  ) {
    return this.users.list(
      companyId,
      { search: query.search, status: query.status, roleId: query.roleId },
      query.toPageRequest(),
    );
  }

  @Get(':id')
  @RequirePermissions('users.read')
  @ApiOperation({ summary: 'Detalle de un usuario de la empresa' })
  @ApiOkResponse({ type: CompanyUserResponseDto })
  @ApiErrors(400, { 404: 'USER_NOT_FOUND' })
  get(
    @CurrentCompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.users.get(companyId, id);
  }

  @Post()
  @RequirePermissions('users.manage')
  @ApiOperation({
    summary: 'Dar acceso a una persona',
    description:
      'Si el correo no tiene cuenta, se crea con la contraseña inicial. ' +
      'Si ya existe (por ejemplo, en otra empresa), solo se agrega a esta empresa.',
  })
  @ApiCreatedResponse({ type: CreateUserResponseDto })
  @ApiErrors(400, { 404: 'ROLE_NOT_FOUND', 409: 'USER_ALREADY_MEMBER' })
  create(@CurrentActor() actor: Actor, @Body() dto: CreateUserDto) {
    return this.users.create(actor, dto);
  }

  @Patch(':id/role')
  @RequirePermissions('users.manage')
  @ApiOperation({ summary: 'Cambiar el rol de un usuario en la empresa' })
  @ApiOkResponse({ type: CompanyUserResponseDto })
  @ApiErrors(400, {
    403: 'CANNOT_MODIFY_SELF',
    404: 'USER_NOT_FOUND | ROLE_NOT_FOUND',
  })
  changeRole(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeUserRoleDto,
  ) {
    return this.users.changeRole(actor, id, dto.roleId);
  }

  @Patch(':id/status')
  @RequirePermissions('users.manage')
  @ApiOperation({ summary: 'Activar o desactivar el acceso a la empresa' })
  @ApiOkResponse({ type: CompanyUserResponseDto })
  @ApiErrors(400, { 403: 'CANNOT_MODIFY_SELF', 404: 'USER_NOT_FOUND' })
  changeStatus(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeUserStatusDto,
  ) {
    return this.users.changeStatus(actor, id, dto.status);
  }

  @Post(':id/password-reset')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequirePermissions('users.manage')
  @ApiOperation({
    summary: 'Enviar enlace de recuperación de contraseña',
    description:
      'El admin NO puede fijar la contraseña de otra persona: la cuenta puede ser compartida ' +
      'con otras empresas. Solo dispara el correo de recuperación al titular.',
  })
  @ApiAcceptedResponse({
    description: 'Correo enviado (o descartado si superó el límite por hora)',
  })
  @ApiErrors(400, { 404: 'USER_NOT_FOUND' })
  async sendPasswordReset(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.users.get(actor.companyId, id); // 404 si no es miembro de esta empresa
    await this.recovery.requestForUser(id, actor);
    return {
      message: 'Se envió el enlace de recuperación al correo del usuario.',
    };
  }
}
