import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../../../shared/auth/authenticated-user';
import { IS_PUBLIC_KEY } from '../../../../shared/auth/public.decorator';
import { AccessTokenService } from '../../domain/ports/access-token.service';

/** Guard global: todo endpoint exige access token salvo los marcados con @Public(). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly accessTokens: AccessTokenService,
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

    const user = await this.accessTokens.verify(token);
    if (!user)
      throw new UnauthorizedException('Access token inválido o expirado');

    request.user = user;
    return true;
  }
}

function extractBearerToken(request: Request): string | null {
  const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
  return scheme === 'Bearer' && token ? token : null;
}
