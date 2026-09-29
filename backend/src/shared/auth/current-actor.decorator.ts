import {
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import type { Actor } from '../application/audit-log';
import type { AuthenticatedUser } from './authenticated-user';

/** Inyecta { companyId, userId } del token. Lanza 403 si no hay empresa activa. */
export const CurrentActor = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Actor => {
    const { user } = ctx
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    if (!user?.companyId) {
      throw new ForbiddenException('Esta acción requiere una empresa activa');
    }
    return { companyId: user.companyId, userId: user.userId };
  },
);
