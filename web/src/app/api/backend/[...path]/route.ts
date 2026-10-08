import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import {
  ACCESS_COOKIE,
  BACKEND_URL,
  clearTokens,
  REFRESH_COOKIE,
  refreshTokens,
  sameOrigin,
  stripTokens,
  writeTokens,
  type TokenSet,
} from '@/lib/server/tokens';

/**
 * Proxy del navegador al backend (patrón BFF). Agrega el token desde la cookie httpOnly,
 * lo renueva si venció y nunca devuelve tokens al navegador.
 */
async function handle(
  request: Request,
  ctx: { params: Promise<{ path: string[] }> },
) {
  if (!sameOrigin(request))
    return NextResponse.json(
      { code: 'FORBIDDEN', message: 'Origen no permitido' },
      { status: 403 },
    );
  const { path } = await ctx.params;
  const target = path.join('/');
  // Login y refresh tienen rutas propias: por aquí nunca circulan tokens
  if (target === 'v1/auth/login' || target === 'auth/refresh') {
    return NextResponse.json({ code: 'NOT_FOUND' }, { status: 404 });
  }

  const store = await cookies();
  let access = store.get(ACCESS_COOKIE)?.value;
  const refresh = store.get(REFRESH_COOKIE)?.value;

  const renew = async () => {
    if (!refresh) return false;
    const tokens = await refreshTokens(refresh);
    if (!tokens) {
      clearTokens(store);
      return false;
    }
    writeTokens(store, tokens);
    access = tokens.accessToken;
    return true;
  };

  if (!access && refresh) await renew();

  const url = `${BACKEND_URL}/${target}${new URL(request.url).search}`;
  const body =
    request.method === 'GET' || request.method === 'HEAD'
      ? undefined
      : await request.arrayBuffer();
  const forwarded = request.headers.get('x-forwarded-for');
  const send = () => {
    const headers = new Headers();
    for (const h of ['content-type', 'accept', 'x-request-id']) {
      const v = request.headers.get(h);
      if (v) headers.set(h, v);
    }
    if (forwarded) headers.set('x-forwarded-for', forwarded);
    if (access) headers.set('authorization', `Bearer ${access}`);
    return fetch(url, {
      method: request.method,
      headers,
      body,
      cache: 'no-store',
    });
  };

  let res = await send();
  if (res.status === 401 && refresh && (await renew())) res = await send();
  if (res.status === 401 && !store.get(REFRESH_COOKIE)) {
    return NextResponse.json(
      {
        code: 'SESSION_EXPIRED',
        message: 'Tu sesión terminó. Inicia sesión de nuevo.',
      },
      { status: 401 },
    );
  }

  const type = res.headers.get('content-type') ?? '';
  const passHeaders = new Headers();
  for (const h of [
    'content-type',
    'content-disposition',
    'x-request-id',
    'retry-after',
  ]) {
    const v = res.headers.get(h);
    if (v) passHeaders.set(h, v);
  }
  passHeaders.set('cache-control', 'no-store');

  // Respuestas con tokens (cambio de contraseña): se guardan en cookies y se retiran del cuerpo
  if (type.includes('application/json') && res.status < 300) {
    const json = (await res.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (
      json &&
      typeof json === 'object' &&
      !Array.isArray(json) &&
      'accessToken' in json
    ) {
      writeTokens(store, json as unknown as TokenSet);
      return NextResponse.json(stripTokens(json), {
        status: res.status,
        headers: passHeaders,
      });
    }
    return NextResponse.json(json, {
      status: res.status,
      headers: passHeaders,
    });
  }
  return new NextResponse(res.status === 204 ? null : await res.arrayBuffer(), {
    status: res.status,
    headers: passHeaders,
  });
}

export {
  handle as GET,
  handle as POST,
  handle as PATCH,
  handle as PUT,
  handle as DELETE,
};
