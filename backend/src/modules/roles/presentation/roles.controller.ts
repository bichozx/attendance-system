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
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
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
import { RolesService } from '../application/roles.service';
import {
  CreateRoleDto,
  PermissionResponseDto,
  RoleResponseDto,
  UpdateRoleDto,
} from './dto/role.dto';

@ApiTags('Roles y permisos')
@ApiBearerAuth(BEARER_AUTH)
@ApiErrors(401, 403)
@Controller()
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get('permissions')
  @RequirePermissions('roles.read')
  @ApiOperation({ summary: 'Catálogo de permisos disponibles' })
  @ApiOkResponse({ type: [PermissionResponseDto] })
  listPermissions() {
    return this.roles.listPermissions();
  }

  @Get('roles')
  @RequirePermissions('roles.read')
  @ApiOperation({ summary: 'Roles del sistema y propios de la empresa' })
  @ApiOkResponse({ type: [RoleResponseDto] })
  list(@CurrentCompanyId() companyId: string) {
    return this.roles.list(companyId);
  }

  @Get('roles/:id')
  @RequirePermissions('roles.read')
  @ApiOperation({ summary: 'Detalle de un rol' })
  @ApiOkResponse({ type: RoleResponseDto })
  @ApiErrors(400, { 404: 'ROLE_NOT_FOUND' })
  get(
    @CurrentCompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.roles.get(companyId, id);
  }

  @Post('roles')
  @RequirePermissions('roles.manage')
  @ApiOperation({ summary: 'Crear un rol propio de la empresa' })
  @ApiCreatedResponse({ type: RoleResponseDto })
  @ApiErrors(
    { 400: 'VALIDATION_ERROR | UNKNOWN_PERMISSIONS' },
    { 409: 'ROLE_CODE_TAKEN' },
  )
  create(@CurrentActor() actor: Actor, @Body() dto: CreateRoleDto) {
    return this.roles.create(actor, {
      code: dto.code,
      name: dto.name,
      description: dto.description ?? null,
      permissions: dto.permissions,
    });
  }

  @Patch('roles/:id')
  @RequirePermissions('roles.manage')
  @ApiOperation({
    summary: 'Editar un rol propio (no aplica a roles del sistema)',
  })
  @ApiOkResponse({ type: RoleResponseDto })
  @ApiErrors(
    { 400: 'VALIDATION_ERROR | UNKNOWN_PERMISSIONS' },
    { 403: 'SYSTEM_ROLE_READONLY', 404: 'ROLE_NOT_FOUND' },
  )
  update(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.roles.update(actor, id, dto);
  }

  @Delete('roles/:id')
  @RequirePermissions('roles.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar un rol propio sin usuarios asignados' })
  @ApiNoContentResponse({ description: 'Rol eliminado' })
  @ApiErrors(400, {
    403: 'SYSTEM_ROLE_READONLY',
    404: 'ROLE_NOT_FOUND',
    409: 'ROLE_IN_USE',
  })
  delete(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.roles.delete(actor, id);
  }
}
