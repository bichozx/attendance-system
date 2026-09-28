import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedUser } from '../../../../shared/auth/authenticated-user';
import { PERMISSIONS_KEY } from '../../../../shared/auth/require-permissions.decorator';

/** Guard global: valida los permisos declarados con @RequirePermissions(). */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required?.length) return true;

    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    if (!user) throw new ForbiddenException();
    if (user.isPlatformAdmin) return true;

    const granted = new Set(user.permissions);
    const missing = required.filter((p) => !granted.has(p));
    if (missing.length || !user.companyId) {
      throw new ForbiddenException('No tiene permisos para esta acción');
    }
    return true;
  }
}
