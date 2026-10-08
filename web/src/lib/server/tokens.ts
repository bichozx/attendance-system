import 'server-only';

/**
 * Tokens en cookies httpOnly: el JavaScript del navegador NUNCA los ve, así que un XSS no
 * puede robarlos. SameSite=Lax impide que otro sitio los use en peticiones POST/PATCH.
 */
export const ACCESS_COOKIE = 'ast_access';
export const REFRESH_COOKIE = 'ast_refresh';

export const BACKEND_URL = (process.env.BACKEND_URL ?? 'http://localhost:3000/api/v1').replace(/\/$/, '');

// Cookies solo por HTTPS en producción. COOKIE_SECURE=false permite probar por HTTP en la red
// local (ej. http://192.168.1.10:3100); nunca lo use en un servidor público.
const secure = process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : process.env.NODE_ENV === 'production';

export interface TokenSet {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken?: string;
  refreshTokenExpiresAt?: string;
}

export interface CookieWriter {
  set(name: string, value: string, options: Record<string, unknown>): unknown;
  delete(name: string): unknown;
}

/** Guarda los tokens. El access vence 30 s antes que en el servidor, para renovarlo a tiempo. */
export function writeTokens(cookies: CookieWriter, t: TokenSet) {
  const base = { httpOnly: true, sameSite: 'lax' as const, secure, path: '/' };
  cookies.set(ACCESS_COOKIE, t.accessToken, { ...base, maxAge: Math.max(30, t.accessTokenExpiresIn - 30) });
  if (t.refreshToken) {
    cookies.set(REFRESH_COOKIE, t.refreshToken, {
      ...base,
      expires: t.refreshTokenExpiresAt ? new Date(t.refreshTokenExpiresAt) : undefined,
    });
  }
}

export function clearTokens(cookies: CookieWriter) {
  cookies.delete(ACCESS_COOKIE);
  cookies.delete(REFRESH_COOKIE);
}

/**
 * Renovación compartida: si llegan varias peticiones a la vez con el token vencido, se hace
 * UN solo refresh. Dos refresh con el mismo token harían que el backend lo detecte como robo
 * y cierre la sesión.
 */
const inFlight = new Map<string, Promise<TokenSet | null>>();

export function refreshTokens(refreshToken: string): Promise<TokenSet | null> {
  let pending = inFlight.get(refreshToken);
  if (!pending) {
    pending = (async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
          cache: 'no-store',
        });
        return res.ok ? ((await res.json()) as TokenSet) : null;
      } catch {
        return null;
      }
    })();
    inFlight.set(refreshToken, pending);
    // Se conserva unos segundos: peticiones que llegan justo después reciben el mismo resultado
    void pending.finally(() => setTimeout(() => inFlight.delete(refreshToken), 10_000));
  }
  return pending;
}

/** Quita los tokens de una respuesta antes de enviarla al navegador. */
export function stripTokens<T extends Record<string, unknown>>(body: T) {
  const { accessToken, refreshToken, accessTokenExpiresIn, refreshTokenExpiresAt, ...rest } = body;
  void accessToken;
  void refreshToken;
  void accessTokenExpiresIn;
  void refreshTokenExpiresAt;
  return rest;
}

/**
 * Defensa extra contra CSRF (además de SameSite=Lax en las cookies).
 * Se rechaza lo que un NAVEGADOR declara que viene de otro sitio:
 * - Sec-Fetch-Site: cross-site / same-site (el JavaScript de una página no puede falsificarlo);
 * - u Origin distinto del host.
 * Los clientes que no son navegadores no envían esos encabezados y no pueden sufrir CSRF.
 */
export function sameOrigin(request: Request): boolean {
  const site = request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') return false;
  const origin = request.headers.get('origin');
  if (!origin || origin === 'null') return origin !== 'null';
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
