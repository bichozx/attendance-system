import { SetMetadata } from '@nestjs/common';

export const PLATFORM_ADMIN_KEY = 'auth:platformAdmin';

/** Solo el superadministrador de la plataforma (no basta ningún permiso de empresa). */
export const PlatformAdminOnly = () => SetMetadata(PLATFORM_ADMIN_KEY, true);
