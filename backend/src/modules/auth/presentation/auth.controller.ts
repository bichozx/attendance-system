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
  Req,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../../shared/auth/authenticated-user';
import { AllowPendingPasswordChange } from '../../../shared/auth/allow-pending-password.decorator';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { Public } from '../../../shared/auth/public.decorator';
import { ApiErrors } from '../../../shared/presentation/api-errors.decorator';
import { BEARER_AUTH } from '../../../shared/presentation/swagger';
import { ChangePasswordUseCase } from '../application/use-cases/change-password.use-case';
import { GetCurrentUserUseCase } from '../application/use-cases/get-current-user.use-case';
import { PasswordRecoveryService } from '../application/use-cases/password-recovery.service';
import { SessionsService } from '../application/use-cases/sessions.service';
import { LoginUseCase } from '../application/use-cases/login.use-case';
import { LogoutUseCase } from '../application/use-cases/logout.use-case';
import { RefreshSessionUseCase } from '../application/use-cases/refresh-session.use-case';
import {
  AuthTokensDto,
  CurrentUserResponseDto,
  LoginResponseDto,
} from './dto/auth-responses.dto';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import {
  AcceptedResponseDto,
  ChangePasswordDto,
  ChangePasswordResponseDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  SessionResponseDto,
} from './dto/password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

const LOGIN_LIMIT = Number(process.env.AUTH_LOGIN_RATE_LIMIT ?? 5);

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly loginUseCase: LoginUseCase,
    private readonly refreshSessionUseCase: RefreshSessionUseCase,
    private readonly logoutUseCase: LogoutUseCase,
    private readonly getCurrentUserUseCase: GetCurrentUserUseCase,
    private readonly changePasswordUseCase: ChangePasswordUseCase,
    private readonly recovery: PasswordRecoveryService,
    private readonly sessions: SessionsService,
  ) {}

  @Public()
  // 5 intentos por minuto por IP (AUTH_LOGIN_RATE_LIMIT; las pruebas automáticas lo suben)
  @Throttle({ default: { limit: LOGIN_LIMIT, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Iniciar sesión',
    description:
      'Si el usuario pertenece a varias empresas responde 409 con la lista en ' +
      '`details.companies`; reintenta enviando `companyId`.',
  })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiErrors(400, 429, {
    401: 'INVALID_CREDENTIALS',
    403: 'USER_NOT_ACTIVE | NO_ACTIVE_COMPANY | COMPANY_ACCESS_DENIED',
    409: 'COMPANY_SELECTION_REQUIRED (ver details.companies)',
  })
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.loginUseCase.execute({
      email: dto.email,
      password: dto.password,
      companyId: dto.companyId,
      client: { userAgent: req.headers['user-agent'], ipAddress: req.ip },
    });
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Renovar tokens',
    description:
      'Entrega un access token y un refresh token nuevos; el anterior deja de servir. ' +
      'No hagas dos refresh en paralelo con el mismo token: se toma como robo y se cierra la sesión.',
  })
  @ApiOkResponse({ type: AuthTokensDto })
  @ApiErrors(400, 429, {
    401: 'INVALID_REFRESH_TOKEN | REFRESH_TOKEN_REUSED',
  })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.refreshSessionUseCase.execute(dto.refreshToken);
  }

  @Post('logout')
  @AllowPendingPasswordChange()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth(BEARER_AUTH)
  @ApiOperation({
    summary: 'Cerrar sesión (actual o en todos los dispositivos)',
  })
  @ApiNoContentResponse({ description: 'Sesión cerrada' })
  @ApiErrors(400, 401)
  async logout(@CurrentUser() user: AuthenticatedUser, @Body() dto: LogoutDto) {
    await this.logoutUseCase.execute(user, dto.allDevices ?? false);
  }

  @Get('me')
  @AllowPendingPasswordChange()
  @ApiBearerAuth(BEARER_AUTH)
  @ApiOperation({ summary: 'Usuario autenticado, empresa activa y permisos' })
  @ApiOkResponse({ type: CurrentUserResponseDto })
  @ApiErrors(401)
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.getCurrentUserUseCase.execute(user);
  }

  // ------------------------------------------------------------------
  // Contraseña
  // ------------------------------------------------------------------

  @Patch('password')
  @AllowPendingPasswordChange()
  @ApiBearerAuth(BEARER_AUTH)
  @ApiOperation({
    summary: 'Cambiar mi contraseña',
    description:
      'Cierra las demás sesiones, conserva la actual y devuelve un access token nuevo. ' +
      'Es obligatorio cuando la cuenta tiene contraseña temporal (PASSWORD_CHANGE_REQUIRED).',
  })
  @ApiOkResponse({ type: ChangePasswordResponseDto })
  @ApiErrors(401, {
    400: 'VALIDATION_ERROR | INVALID_CURRENT_PASSWORD | PASSWORD_UNCHANGED',
  })
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.changePasswordUseCase.execute(
      user,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('password/forgot')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Solicitar enlace de recuperación',
    description:
      'Responde siempre igual, exista o no el correo, para no revelar qué cuentas existen.',
  })
  @ApiAcceptedResponse({ type: AcceptedResponseDto })
  @ApiErrors(400, 429)
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    await this.recovery.request(dto.email, req.ip);
    return {
      message:
        'Si el correo está registrado, recibirás un enlace para restablecer la contraseña.',
    };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('password/reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Restablecer la contraseña con el enlace del correo',
    description: 'Cierra todas las sesiones de la cuenta y la desbloquea.',
  })
  @ApiNoContentResponse({ description: 'Contraseña restablecida' })
  @ApiErrors(429, { 400: 'VALIDATION_ERROR | INVALID_RESET_TOKEN' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.recovery.reset(dto.token, dto.newPassword);
  }

  // ------------------------------------------------------------------
  // Sesiones
  // ------------------------------------------------------------------

  @Get('sessions')
  @ApiBearerAuth(BEARER_AUTH)
  @ApiOperation({ summary: 'Mis sesiones abiertas (dispositivos)' })
  @ApiOkResponse({ type: [SessionResponseDto] })
  @ApiErrors(401)
  listSessions(@CurrentUser() user: AuthenticatedUser) {
    return this.sessions.list(user);
  }

  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth(BEARER_AUTH)
  @ApiOperation({
    summary: 'Cerrar una de mis sesiones (ej. un teléfono perdido)',
  })
  @ApiNoContentResponse({ description: 'Sesión cerrada' })
  @ApiErrors(400, 401, { 404: 'SESSION_NOT_FOUND' })
  async revokeSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.sessions.revoke(user, id);
  }
}
