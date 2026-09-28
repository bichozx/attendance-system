// import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
// import { AuthService } from './auth.service';
// import { CreateAuthDto } from './dto/create-auth.dto';
// import { UpdateAuthDto } from './dto/update-auth.dto';

// @Controller('auth')
// export class AuthController {
//   constructor(private readonly authService: AuthService) {}

//   @Post()
//   create(@Body() createAuthDto: CreateAuthDto) {
//     return this.authService.create(createAuthDto);
//   }

//   @Get()
//   findAll() {
//     return this.authService.findAll();
//   }

//   @Get(':id')
//   findOne(@Param('id') id: string) {
//     return this.authService.findOne(+id);
//   }

//   @Patch(':id')
//   update(@Param('id') id: string, @Body() updateAuthDto: UpdateAuthDto) {
//     return this.authService.update(+id, updateAuthDto);
//   }

//   @Delete(':id')
//   remove(@Param('id') id: string) {
//     return this.authService.remove(+id);
//   }
// }

// console.log("🚀 ~ import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
// import { AuthService } from './auth.service';
// import { CreateAuthDto } from './dto/create-auth.dto';
// import { UpdateAuthDto } from './dto/update-auth.dto';

// @Controller('auth')
// export class AuthController {
//   constructor(private readonly authService: AuthService) {}

//   @Post()
//   create(@Body() createAuthDto: CreateAuthDto) {
//     return this.authService.create(createAuthDto);
//   }

//   @Get()
//   findAll() {
//     return this.authService.findAll();
//   }

//   @Get(':id')
//   findOne(@Param('id') id: string) {
//     return this.authService.findOne(+id);
//   }

//   @Patch(':id')
//   update(@Param('id') id: string, @Body() updateAuthDto: UpdateAuthDto) {
//     return this.authService.update(+id, updateAuthDto);
//   }

//   @Delete(':id')
//   remove(@Param('id') id: string) {
//     return this.authService.remove(+id);
//   }
// }
// :", import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
// import { AuthService } from './auth.service';
// import { CreateAuthDto } from './dto/create-auth.dto';
// import { UpdateAuthDto } from './dto/update-auth.dto';

// @Controller('auth')
// export class AuthController {
//   constructor(private readonly authService: AuthService) {}

//   @Post()
//   create(@Body() createAuthDto: CreateAuthDto) {
//     return this.authService.create(createAuthDto);
//   }

//   @Get()
//   findAll() {
//     return this.authService.findAll();
//   }

//   @Get(':id')
//   findOne(@Param('id') id: string) {
//     return this.authService.findOne(+id);
//   }

//   @Patch(':id')
//   update(@Param('id') id: string, @Body() updateAuthDto: UpdateAuthDto) {
//     return this.authService.update(+id, updateAuthDto);
//   }

//   @Delete(':id')
//   remove(@Param('id') id: string) {
//     return this.authService.remove(+id);
//   }
// }
// )

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../../shared/auth/authenticated-user';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { Public } from '../../../shared/auth/public.decorator';
import { ApiErrors } from '../../../shared/presentation/api-errors.decorator';
import { BEARER_AUTH } from '../../../shared/presentation/swagger';
import { GetCurrentUserUseCase } from '../application/use-cases/get-current-user.use-case';
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
import { RefreshTokenDto } from './dto/refresh-token.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly loginUseCase: LoginUseCase,
    private readonly refreshSessionUseCase: RefreshSessionUseCase,
    private readonly logoutUseCase: LogoutUseCase,
    private readonly getCurrentUserUseCase: GetCurrentUserUseCase,
  ) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } }) // 5 intentos por minuto por IP
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
  @ApiBearerAuth(BEARER_AUTH)
  @ApiOperation({ summary: 'Usuario autenticado, empresa activa y permisos' })
  @ApiOkResponse({ type: CurrentUserResponseDto })
  @ApiErrors(401)
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.getCurrentUserUseCase.execute(user);
  }
}
