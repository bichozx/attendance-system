import {
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import type { AuthenticatedUser } from './authenticated-user';

/**
 * Inyecta el companyId (tenant) del token. Lanza 403 si no hay empresa activa.
 * Todo endpoint que lea o escriba datos de una empresa debe usarlo:
 * el companyId NUNCA se toma del body ni de la URL.
 */
export const CurrentCompanyId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const { user } = ctx
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    if (!user?.companyId) {
      throw new ForbiddenException('Esta acción requiere una empresa activa');
    }
    return user.companyId;
  },
);
