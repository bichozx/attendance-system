import { Injectable } from '@nestjs/common';
import {
  InvalidRefreshTokenError,
  RefreshTokenReusedError,
} from '../../domain/auth.errors';
import type { ActiveMembership, SessionRecord } from '../../domain/auth.types';
import { AuthRepository } from '../../domain/ports/auth.repository';
import { RefreshTokenCodec } from '../../domain/ports/refresh-token.codec';
import type { AuthTokens } from '../auth.results';
import { AuthSettings } from '../auth.settings';
import { SessionIssuer } from '../session-issuer';

/**
 * Rotación de refresh tokens: cada refresh invalida el token anterior y entrega uno nuevo.
 * Si alguien presenta un token ya rotado, se asume robo y se revoca toda la sesión.
 */
@Injectable()
export class RefreshSessionUseCase {
  constructor(
    private readonly repository: AuthRepository,
    private readonly refreshTokens: RefreshTokenCodec,
    private readonly sessions: SessionIssuer,
    private readonly settings: AuthSettings,
  ) {}

  async execute(refreshToken: string): Promise<AuthTokens> {
    const parsed = this.refreshTokens.parse(refreshToken);
    if (!parsed) throw new InvalidRefreshTokenError();

    const session = await this.repository.findSessionById(parsed.sessionId);
    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      throw new InvalidRefreshTokenError();
    }

    if (session.refreshTokenHash !== parsed.hash) {
      await this.repository.revokeSession(session.id);
      throw new RefreshTokenReusedError();
    }

    const { user, membership } = await this.loadCurrentAccess(session);

    const next = this.refreshTokens.issue(session.id);
    const refreshTokenExpiresAt = this.settings.refreshTokenExpiresAt();
    const rotated = await this.repository.rotateSession(
      session.id,
      parsed.hash,
      next.hash,
      refreshTokenExpiresAt,
    );
    // Otra petición rotó este mismo token primero: también se trata como reuso.
    if (!rotated) {
      await this.repository.revokeSession(session.id);
      throw new RefreshTokenReusedError();
    }

    const access = await this.sessions.signAccessToken(
      user,
      membership,
      session.id,
    );
    return {
      accessToken: access.token,
      accessTokenExpiresIn: access.expiresIn,
      refreshToken: next.token,
      refreshTokenExpiresAt,
    };
  }

  /**
   * Vuelve a leer usuario, membresía y permisos: si el admin desactivó al usuario
   * o le cambió el rol, el cambio se aplica en el siguiente refresh.
   */
  private async loadCurrentAccess(session: SessionRecord) {
    const user = await this.repository.findUserById(session.userId);
    if (!user || user.status !== 'ACTIVE') {
      return this.revokeAndFail(session.id);
    }

    let membership: ActiveMembership | null = null;
    if (session.companyId) {
      const memberships = await this.repository.findActiveMemberships(user.id);
      membership =
        memberships.find((m) => m.companyId === session.companyId) ?? null;
      if (!membership) return this.revokeAndFail(session.id);
    } else if (!user.isPlatformAdmin) {
      return this.revokeAndFail(session.id);
    }

    return { user, membership };
  }

  private async revokeAndFail(sessionId: string): Promise<never> {
    await this.repository.revokeSession(sessionId);
    throw new InvalidRefreshTokenError();
  }
}
