import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { BACKEND_URL, sameOrigin, stripTokens, writeTokens, type TokenSet } from '@/lib/server/tokens';

/** Login: el servidor guarda los tokens en cookies httpOnly y al navegador solo le llega el perfil. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ code: 'FORBIDDEN' }, { status: 403 });
  const forwarded = request.headers.get('x-forwarded-for');
  const res = await fetch(`${BACKEND_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(forwarded && { 'X-Forwarded-For': forwarded }) },
    body: await request.text(),
    cache: 'no-store',
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) return NextResponse.json(body, { status: res.status });
  writeTokens(await cookies(), body as unknown as TokenSet);
  return NextResponse.json(stripTokens(body));
}
