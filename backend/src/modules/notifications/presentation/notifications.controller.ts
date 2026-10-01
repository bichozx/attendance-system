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
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Actor } from '../../../shared/application/audit-log';
import type { AuthenticatedUser } from '../../../shared/auth/authenticated-user';
import { CurrentActor } from '../../../shared/auth/current-actor.decorator';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { ApiErrors } from '../../../shared/presentation/api-errors.decorator';
import { ApiPaginatedResponse } from '../../../shared/presentation/api-paginated-response.decorator';
import { BEARER_AUTH } from '../../../shared/presentation/swagger';
import { InboxService } from '../application/inbox.service';
import {
  AnnouncementDto,
  AnnouncementResultDto,
  InboxItemDto,
  InboxQueryDto,
  RegisterDeviceDto,
  UnreadCountDto,
  UnregisterDeviceDto,
} from './dto/notification.dto';

@ApiTags('Mis notificaciones (app móvil)')
@ApiBearerAuth(BEARER_AUTH)
@ApiErrors(401, 403)
@Controller('me')
export class MyNotificationsController {
  constructor(private readonly inbox: InboxService) {}

  @Get('notifications')
  @ApiOperation({ summary: 'Bandeja de notificaciones (empresa activa)' })
  @ApiPaginatedResponse(InboxItemDto)
  @ApiErrors(400)
  list(@CurrentActor() actor: Actor, @Query() q: InboxQueryDto) {
    return this.inbox.list(actor, q.unreadOnly ?? false, q.toPageRequest());
  }

  @Get('notifications/unread-count')
  @ApiOperation({ summary: 'Cantidad sin leer (para el globo del ícono)' })
  @ApiOkResponse({ type: UnreadCountDto })
  unreadCount(@CurrentActor() actor: Actor) {
    return this.inbox.unreadCount(actor);
  }

  @Post('notifications/:id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Marcar como leída' })
  @ApiNoContentResponse({ description: 'Marcada' })
  @ApiErrors(400, { 404: 'NOTIFICATION_NOT_FOUND' })
  async markRead(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.inbox.markRead(actor, id);
  }

  @Post('notifications/read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marcar todas como leídas' })
  markAllRead(@CurrentActor() actor: Actor) {
    return this.inbox.markAllRead(actor);
  }

  @Post('devices')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Registrar este dispositivo para recibir push',
    description:
      'El dispositivo queda ligado a la sesión actual: al cerrar sesión, cambiar la contraseña ' +
      'o suspenderse la empresa, deja de recibir notificaciones automáticamente.',
  })
  @ApiNoContentResponse({ description: 'Registrado' })
  @ApiErrors(400)
  async registerDevice(
    @CurrentActor() actor: Actor,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RegisterDeviceDto,
  ) {
    await this.inbox.registerDevice(
      { ...actor, sessionId: user.sessionId },
      dto.token,
      dto.platform,
    );
  }

  @Post('devices/unregister')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Dejar de recibir push en este dispositivo' })
  @ApiNoContentResponse({ description: 'Eliminado' })
  @ApiErrors(400)
  async unregisterDevice(
    @CurrentActor() actor: Actor,
    @Body() dto: UnregisterDeviceDto,
  ) {
    await this.inbox.unregisterDevice(actor, dto.token);
  }
}

@ApiTags('Avisos (supervisión)')
@ApiBearerAuth(BEARER_AUTH)
@ApiErrors(401, 403)
@Controller('notifications')
export class AnnouncementsController {
  constructor(private readonly inbox: InboxService) {}

  @Post('announcements')
  @RequirePermissions('notifications.send')
  @ApiOperation({
    summary: 'Enviar un aviso',
    description:
      'A toda la empresa, a quienes tengan cierta sede principal o a empleados puntuales.',
  })
  @ApiCreatedResponse({ type: AnnouncementResultDto })
  @ApiErrors({ 400: 'VALIDATION_ERROR | EMPTY_AUDIENCE' })
  announce(@CurrentActor() actor: Actor, @Body() dto: AnnouncementDto) {
    return this.inbox.announce(actor, dto);
  }
}
