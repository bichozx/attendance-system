import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AuthenticatedUser } from '../../../shared/auth/authenticated-user';
import {
  AccessTokenService,
  SignedAccessToken,
} from '../domain/ports/access-token.service';
import { AuthSettings } from '../application/auth.settings';

/** Claims compactos dentro del JWT. */
interface AccessTokenPayload {
  sub: string;
  sid: string;
  cid: string | null;
  pa: boolean;
  perms: string[];
  /** Contraseña temporal pendiente de cambio. */
  pwc?: boolean;
}

@Injectable()
export class JwtAccessTokenService extends AccessTokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly settings: AuthSettings,
  ) {
    super();
  }

  async sign(claims: AuthenticatedUser): Promise<SignedAccessToken> {
    const payload: AccessTokenPayload = {
      sub: claims.userId,
      sid: claims.sessionId,
      cid: claims.companyId,
      pa: claims.isPlatformAdmin,
      perms: claims.permissions,
      ...(claims.mustChangePassword && { pwc: true }),
    };
    const token = await this.jwt.signAsync(payload);
    return { token, expiresIn: this.settings.accessTokenTtlSeconds };
  }

  async verify(token: string): Promise<AuthenticatedUser | null> {
    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
      return {
        userId: payload.sub,
        sessionId: payload.sid,
        companyId: payload.cid,
        isPlatformAdmin: payload.pa,
        permissions: payload.perms,
        mustChangePassword: payload.pwc === true,
      };
    } catch {
      return null;
    }
  }
}
