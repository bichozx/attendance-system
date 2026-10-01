import { APP_GUARD } from '@nestjs/core';
import { AccessTokenService } from './domain/ports/access-token.service';
import { AccountEmails } from './application/account-emails';
import { Argon2PasswordHasher } from './infrastructure/argon2-password-hasher';
import { AuthController } from './presentation/auth.controller';
import { AuthRepository } from './domain/ports/auth.repository';
import { AuthSettings } from './application/auth.settings';
import { ChangePasswordUseCase } from './application/use-cases/change-password.use-case';
import { ConfigService } from '@nestjs/config';
import { CryptoRefreshTokenCodec } from './infrastructure/crypto-refresh-token.codec';
import { CryptoSecretTokens } from './infrastructure/crypto-secret-tokens';
import { DEFAULT_SECURITY_POLICY } from './domain/account-security';
import { GetCurrentUserUseCase } from './application/use-cases/get-current-user.use-case';
import { JwtAccessTokenService } from './infrastructure/jwt-access-token.service';
import { JwtAuthGuard } from './presentation/guards/jwt-auth.guard';
import { JwtModule } from '@nestjs/jwt';
import { LoginUseCase } from './application/use-cases/login.use-case';
import { LogoutUseCase } from './application/use-cases/logout.use-case';
import { Module } from '@nestjs/common';
import { PasswordHasher } from './domain/ports/password-hasher';
import { PasswordRecoveryService } from './application/use-cases/password-recovery.service';
import { PermissionsGuard } from './presentation/guards/permissions.guard';
import { PrismaAuthRepository } from './infrastructure/prisma-auth.repository';
import { RefreshSessionUseCase } from './application/use-cases/refresh-session.use-case';
import { RefreshTokenCodec } from './domain/ports/refresh-token.codec';
import { SecretTokens } from './domain/ports/secret-tokens';
import { SessionIssuer } from './application/session-issuer';
import { SessionsService } from './application/use-cases/sessions.service';

function accessTtl(config: ConfigService): number {
  return Number(config.get('JWT_ACCESS_TTL_SECONDS') ?? 900);
}

@Module({
  imports: [
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
      useFactory: (config: ConfigService) => {
        const num = (key: string, fallback: number) =>
          Number(config.get(key) ?? fallback);
        return new AuthSettings(
          accessTtl(config),
          num('REFRESH_TOKEN_TTL_DAYS', 30),
          {
            maxFailedLogins: num(
              'AUTH_MAX_FAILED_LOGINS',
              DEFAULT_SECURITY_POLICY.maxFailedLogins,
            ),
            lockMinutes: num(
              'AUTH_LOCK_MINUTES',
              DEFAULT_SECURITY_POLICY.lockMinutes,
            ),
            resetTokenTtlMinutes: num(
              'PASSWORD_RESET_TTL_MINUTES',
              DEFAULT_SECURITY_POLICY.resetTokenTtlMinutes,
            ),
            maxResetRequestsPerHour:
              DEFAULT_SECURITY_POLICY.maxResetRequestsPerHour,
            inviteTokenTtlHours: num(
              'INVITE_TTL_HOURS',
              DEFAULT_SECURITY_POLICY.inviteTokenTtlHours,
            ),
          },
          config.get<string>('PASSWORD_RESET_URL') ?? undefined,
        );
      },
    },

    // Puertos del dominio → implementaciones de infraestructura
    { provide: AuthRepository, useClass: PrismaAuthRepository },
    { provide: PasswordHasher, useClass: Argon2PasswordHasher },
    { provide: AccessTokenService, useClass: JwtAccessTokenService },
    { provide: RefreshTokenCodec, useClass: CryptoRefreshTokenCodec },
    { provide: SecretTokens, useClass: CryptoSecretTokens },

    // Aplicación
    SessionIssuer,
    LoginUseCase,
    RefreshSessionUseCase,
    LogoutUseCase,
    GetCurrentUserUseCase,
    ChangePasswordUseCase,
    PasswordRecoveryService,
    SessionsService,
    AccountEmails,

    // Guards globales: primero autenticación, luego permisos
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  // Users usa PasswordRecoveryService para que un admin envíe el enlace de recuperación
  exports: [PasswordHasher, PasswordRecoveryService, AccountEmails],
})
export class AuthModule {}

// function accessTtl(config: ConfigService): number {
//   return Number(config.get('JWT_ACCESS_TTL_SECONDS') ?? 900);
// }

// @Module({
//   imports: [
//     PrismaModule,
//     JwtModule.registerAsync({
//       inject: [ConfigService],
//       useFactory: (config: ConfigService) => ({
//         secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
//         signOptions: { algorithm: 'HS256', expiresIn: accessTtl(config) },
//         verifyOptions: { algorithms: ['HS256'] },
//       }),
//     }),
//   ],
//   controllers: [AuthController],
//   providers: [
//     {
//       provide: AuthSettings,
//       inject: [ConfigService],
//       useFactory: (config: ConfigService) =>
//         new AuthSettings(
//           accessTtl(config),
//           Number(config.get('REFRESH_TOKEN_TTL_DAYS') ?? 30),
//         ),
//     },

//     // Puertos del dominio → implementaciones de infraestructura
//     { provide: AuthRepository, useClass: PrismaAuthRepository },
//     { provide: PasswordHasher, useClass: Argon2PasswordHasher },
//     { provide: AccessTokenService, useClass: JwtAccessTokenService },
//     { provide: RefreshTokenCodec, useClass: CryptoRefreshTokenCodec },

//     // Aplicación
//     SessionIssuer,
//     LoginUseCase,
//     RefreshSessionUseCase,
//     LogoutUseCase,
//     GetCurrentUserUseCase,

//     // Guards globales: primero autenticación, luego permisos
//     { provide: APP_GUARD, useClass: JwtAuthGuard },
//     { provide: APP_GUARD, useClass: PermissionsGuard },
//   ],
//   exports: [PasswordHasher],
// })
// export class AuthModule {}
