import { APP_GUARD } from '@nestjs/core';
import { AccessTokenService } from './domain/ports/access-token.service';
import { Argon2PasswordHasher } from './infrastructure/argon2-password-hasher';
import { AuthController } from './presentation/auth.controller';
import { AuthRepository } from './domain/ports/auth.repository';
import { AuthService } from './auth.service';
import { AuthSettings } from './application/auth.settings';
import { ConfigService } from '@nestjs/config';
import { CryptoRefreshTokenCodec } from './infrastructure/crypto-refresh-token.codec';
import { GetCurrentUserUseCase } from './application/use-cases/get-current-user.use-case';
import { JwtAccessTokenService } from './infrastructure/jwt-access-token.service';
import { JwtAuthGuard } from './presentation/guards/jwt-auth.guard';
import { JwtModule } from '@nestjs/jwt';
import { LoginUseCase } from './application/use-cases/login.use-case';
import { LogoutUseCase } from './application/use-cases/logout.use-case';
import { Module } from '@nestjs/common';
import { PasswordHasher } from './domain/ports/password-hasher';
import { PermissionsGuard } from './presentation/guards/permissions.guard';
import { PrismaAuthRepository } from './infrastructure/prisma-auth.repository';
import { PrismaModule } from '../../shared/infrastructure/prisma/prisma.module';
import { RefreshSessionUseCase } from './application/use-cases/refresh-session.use-case';
import { RefreshTokenCodec } from './domain/ports/refresh-token.codec';
import { SessionIssuer } from './application/session-issuer';

function accessTtl(config: ConfigService): number {
  return Number(config.get('JWT_ACCESS_TTL_SECONDS') ?? 900);
}

@Module({
  imports: [
    PrismaModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        signOptions: { algorithm: 'HS256', expiresIn: accessTtl(config) },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    {
      provide: AuthSettings,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new AuthSettings(
          accessTtl(config),
          Number(config.get('REFRESH_TOKEN_TTL_DAYS') ?? 30),
        ),
    },

    // Puertos del dominio → implementaciones de infraestructura
    { provide: AuthRepository, useClass: PrismaAuthRepository },
    { provide: PasswordHasher, useClass: Argon2PasswordHasher },
    { provide: AccessTokenService, useClass: JwtAccessTokenService },
    { provide: RefreshTokenCodec, useClass: CryptoRefreshTokenCodec },

    // Aplicación
    SessionIssuer,
    LoginUseCase,
    RefreshSessionUseCase,
    LogoutUseCase,
    GetCurrentUserUseCase,

    // Guards globales: primero autenticación, luego permisos
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [PasswordHasher],
})
export class AuthModule {}
