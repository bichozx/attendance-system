import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../../../shared/auth/authenticated-user';
import { ALLOW_PENDING_PASSWORD_KEY } from '../../../../shared/auth/allow-pending-password.decorator';
import { IS_PUBLIC_KEY } from '../../../../shared/auth/public.decorator';
import { PasswordChangeRequiredError } from '../../domain/auth.errors';
import { AccessTokenService } from '../../domain/ports/access-token.service';
import { SessionAccessReader } from '../../domain/ports/session-access.reader';
import { resolveLiveAccess } from '../../domain/session-access.rules';

/** Guard global: todo endpoint exige access token salvo los marcados con @Public(). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly accessTokens: AccessTokenService,
    private readonly sessions: SessionAccessReader,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    const token = extractBearerToken(request);
    if (!token) throw new UnauthorizedException('Falta el access token');

    const claims = await this.accessTokens.verify(token);
    if (!claims)
      throw new UnauthorizedException('Access token inválido o expirado');

    // La firma no basta: la sesión, la cuenta, la membresía y la empresa deben seguir activas
    const user = resolveLiveAccess(
      claims,
      await this.sessions.find(claims.sessionId),
      new Date(),
    );
    if (!user)
      throw new UnauthorizedException(
        'La sesión ya no es válida. Inicie sesión de nuevo.',
      );

    // Contraseña temporal: el servidor bloquea todo lo demás (no depende de la app)
    if (
      user.mustChangePassword &&
      !this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_PASSWORD_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      throw new PasswordChangeRequiredError();
    }

    request.user = user;
    return true;
  }
}

function extractBearerToken(request: Request): string | null {
  const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
  return scheme === 'Bearer' && token ? token : null;
}
