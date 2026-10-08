import 'server-only';
import { cookies } from 'next/headers';
import { cache } from 'react';

import type { components } from '@/lib/api/schema';
import { ACCESS_COOKIE, BACKEND_URL } from './tokens';

export type CurrentUser = components['schemas']['CurrentUserResponseDto'];

/**
 * Sesión para componentes de servidor. NO renueva tokens (aquí no se pueden escribir
 * cookies): de eso se encarga proxy.ts antes de cada navegación.
 */
export const getSession = cache(async (): Promise<CurrentUser | null> => {
  const access = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!access) return null;
  const res = await fetch(`${BACKEND_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${access}` },
    cache: 'no-store',
  });
  return res.ok ? ((await res.json()) as CurrentUser) : null;
});

export function can(session: CurrentUser | null, permission: string): boolean {
  return !!session && (session.user.isPlatformAdmin || session.permissions.includes(permission));
}
