import { SetMetadata } from '@nestjs/common';

export const ALLOW_PENDING_PASSWORD_KEY = 'auth:allowPendingPassword';

/**
 * Permite el endpoint aunque la cuenta tenga una contraseña temporal sin cambiar.
 * Solo para: ver el perfil, cambiar la contraseña y cerrar sesión.
 */
export const AllowPendingPasswordChange = () =>
  SetMetadata(ALLOW_PENDING_PASSWORD_KEY, true);
