import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { ACCESS_COOKIE, BACKEND_URL, clearTokens, sameOrigin } from '@/lib/server/tokens';

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ code: 'FORBIDDEN' }, { status: 403 });
  const store = await cookies();
  const access = store.get(ACCESS_COOKIE)?.value;
  if (access) {
    // Cierra la sesión en el servidor; si falla (sin red), igual se borran las cookies
    await fetch(`${BACKEND_URL}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${access}` },
      body: JSON.stringify({ allDevices: false }),
      cache: 'no-store',
    }).catch(() => undefined);
  }
  clearTokens(store);
  return new NextResponse(null, { status: 204 });
}
