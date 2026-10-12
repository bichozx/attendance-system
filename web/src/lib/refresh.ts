/**
 * Renovación del access token compartida por TODO el servidor del panel: proxy.ts (navegación)
 * y los BFF (/api/...). Si varias peticiones llegan a la vez con el token vencido, se hace UN
 * solo refresh y todas reciben el mismo resultado. El backend rota el refresh token en cada
 * uso; si recibe dos veces el mismo, lo toma como robo y cierra la sesión (eso mandaba al
 * usuario a /login?vencida=1 al rato de estar trabajando).
 *
 * Sin `server-only` a propósito: proxy.ts no puede importar módulos marcados así. El mapa vive
 * en globalThis para que proxy.ts y las rutas compartan el mismo aunque Next los empaquete por
 * separado.
 */
export interface RefreshedTokens {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

const KEY = Symbol.for('panel.refresh-in-flight');
const store = globalThis as typeof globalThis & { [KEY]?: Map<string, Promise<RefreshedTokens | null>> };
const inFlight = (store[KEY] ??= new Map<string, Promise<RefreshedTokens | null>>());

/**
 * El resultado se conserva 60 s: el navegador puede seguir enviando el refresh viejo un
 * momento (peticiones que salieron antes de recibir las cookies nuevas) y deben recibir los
 * mismos tokens en vez de provocar un segundo refresh.
 */
const KEEP_MS = 60_000;

export function refreshOnce(backendUrl: string, refreshToken: string): Promise<RefreshedTokens | null> {
  let pending = inFlight.get(refreshToken);
  if (!pending) {
    pending = (async () => {
      try {
        const res = await fetch(`${backendUrl}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
          cache: 'no-store',
        });
        return res.ok ? ((await res.json()) as RefreshedTokens) : null;
      } catch {
        return null;
      }
    })();
    inFlight.set(refreshToken, pending);
    void pending.then((tokens) => {
      // Un fallo de red no se guarda: el siguiente intento puede salir bien
      setTimeout(() => inFlight.delete(refreshToken), tokens ? KEEP_MS : 0);
    });
  }
  return pending;
}
