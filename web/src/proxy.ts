import { NextResponse, type NextRequest } from 'next/server';

const ACCESS = 'ast_access';
const REFRESH = 'ast_refresh';
const BACKEND_URL = (process.env.BACKEND_URL ?? 'http://localhost:3000/api/v1').replace(/\/$/, '');
const PUBLIC = ['/login', '/recuperar-clave', '/restablecer-clave'];
// Cookies solo por HTTPS en producción. COOKIE_SECURE=false permite probar por HTTP en la red
// local (ej. http://192.168.1.10:3100); nunca lo use en un servidor público.
const secure = process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : process.env.NODE_ENV === 'production';

/**
 * Antes de cada navegación: sin sesión → login. Con el access vencido y el refresh vigente,
 * se renueva AQUÍ (las páginas de servidor no pueden escribir cookies).
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isPublic = PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const access = request.cookies.get(ACCESS)?.value;
  const refresh = request.cookies.get(REFRESH)?.value;
  if (!refresh) {
    if (isPublic) return NextResponse.next();
    const login = new URL('/login', request.url);
    if (pathname !== '/') login.searchParams.set('next', pathname + search);
    return NextResponse.redirect(login);
  }
  if (access) {
    return pathname === '/login' ? NextResponse.redirect(new URL('/', request.url)) : NextResponse.next();
  }

  // Access vencido: renovar
  const res = await fetch(`${BACKEND_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: refresh }),
    cache: 'no-store',
  }).catch(() => null);

  if (!res?.ok) {
    const out = isPublic ? NextResponse.next() : NextResponse.redirect(new URL('/login', request.url));
    out.cookies.delete(ACCESS);
    out.cookies.delete(REFRESH);
    return out;
  }
  const t = (await res.json()) as {
    accessToken: string;
    accessTokenExpiresIn: number;
    refreshToken: string;
    refreshTokenExpiresAt: string;
  };
  // La página que se va a renderizar debe ver los tokens nuevos...
  request.cookies.set(ACCESS, t.accessToken);
  request.cookies.set(REFRESH, t.refreshToken);
  const out = NextResponse.next({ request: { headers: request.headers } });
  // ...y el navegador debe guardarlos
  const base = { httpOnly: true, sameSite: 'lax' as const, secure, path: '/' };
  out.cookies.set(ACCESS, t.accessToken, { ...base, maxAge: Math.max(30, t.accessTokenExpiresIn - 30) });
  out.cookies.set(REFRESH, t.refreshToken, { ...base, expires: new Date(t.refreshTokenExpiresAt) });
  return out;
}

export const config = {
  // Todo menos las rutas API (se protegen solas), archivos internos y estáticos
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|ico|woff2?)$).*)'],
};
