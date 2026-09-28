import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../../../shared/auth/authenticated-user';
import type { ActiveMembership, AuthUser } from '../domain/auth.types';
import { AccessTokenService } from '../domain/ports/access-token.service';
import { AuthRepository } from '../domain/ports/auth.repository';
import { RefreshTokenCodec } from '../domain/ports/refresh-token.codec';
import type { AuthTokens, ClientContext } from './auth.results';
import { AuthSettings } from './auth.settings';

/** Crea sesiones nuevas y firma access tokens. Compartido por login y refresh. */
@Injectable()
export class SessionIssuer {
  constructor(
    private readonly repository: AuthRepository,
    private readonly accessTokens: AccessTokenService,
    private readonly refreshTokens: RefreshTokenCodec,
    private readonly settings: AuthSettings,
  ) {}

  async startSession(
    user: AuthUser,
    membership: ActiveMembership | null,
    client: ClientContext,
  ): Promise<AuthTokens> {
    const refresh = this.refreshTokens.issue();
    const refreshTokenExpiresAt = this.settings.refreshTokenExpiresAt();

    await this.repository.createSession({
      id: refresh.sessionId,
      userId: user.id,
      companyId: membership?.companyId ?? null,
      refreshTokenHash: refresh.hash,
      expiresAt: refreshTokenExpiresAt,
      userAgent: client.userAgent,
      ipAddress: client.ipAddress,
    });

    const access = await this.signAccessToken(
      user,
      membership,
      refresh.sessionId,
    );

    return {
      accessToken: access.token,
      accessTokenExpiresIn: access.expiresIn,
      refreshToken: refresh.token,
      refreshTokenExpiresAt,
    };
  }

  signAccessToken(
    user: AuthUser,
    membership: ActiveMembership | null,
    sessionId: string,
  ) {
    const claims: AuthenticatedUser = {
      userId: user.id,
      sessionId,
      companyId: membership?.companyId ?? null,
      isPlatformAdmin: user.isPlatformAdmin,
      permissions: membership?.permissions ?? [],
    };
    return this.accessTokens.sign(claims);
  }
}
