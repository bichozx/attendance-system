import type { AuthenticatedUser } from '../../../shared/auth/authenticated-user';
import type { LiveSessionAccess } from './ports/session-access.reader';

/**
 * Decide si un access token (ya verificado criptográficamente) sigue valiendo.
 * Un token filtrado deja de servir apenas se cierra la sesión, se desactiva la cuenta,
 * se retira el acceso a la empresa o se suspende la empresa, sin esperar a que expire.
 * Devuelve los datos actualizados (permisos del rol vigente) o null si ya no es válido.
 */
export function resolveLiveAccess(
  claims: AuthenticatedUser,
  live: LiveSessionAccess | null,
  now: Date,
): AuthenticatedUser | null {
  if (!live) return null;
  if (live.revokedAt || live.expiresAt <= now) return null;
  // El token debe corresponder exactamente a esta sesión
  if (live.userId !== claims.userId || live.companyId !== claims.companyId)
    return null;
  if (live.userStatus !== 'ACTIVE') return null;

  if (live.companyId) {
    if (!live.permissions) return null; // membresía o empresa desactivada
  } else if (!live.isPlatformAdmin) {
    return null; // sin empresa solo puede operar el superadmin
  }

  return {
    ...claims,
    isPlatformAdmin: live.isPlatformAdmin,
    // Un cambio de rol aplica de inmediato, no en el siguiente refresh
    permissions: live.permissions ?? [],
    mustChangePassword: live.mustChangePassword,
  };
}
