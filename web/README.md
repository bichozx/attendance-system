# Panel de administración (Next.js 16)

Panel web para administradores y supervisores: el día en vivo, aprobaciones, turnos y periodos,
empleados (con contratos e importación desde Excel), reportes para nómina, establecimientos y
geocercas, usuarios, roles, configuración de la empresa y auditoría. El superadministrador de la
plataforma entra a `/plataforma` (empresas, invitaciones y estado).

## Arranque

```bash
cp .env.example .env.local      # ajuste BACKEND_URL si el backend no está en el puerto 3000
pnpm install
pnpm gen:api                    # tipos desde el Swagger del backend (con el backend corriendo)
pnpm dev                        # http://localhost:3100 si usa: pnpm dev -p 3100
```

Usuario de demostración: `admin@demo.local` / `Demo123!` (creado por el seed del backend).
Superadministrador: `superadmin@asistencia.local` / el valor de `SEED_PLATFORM_ADMIN_PASSWORD`.
Para ver el dashboard con datos: `node scripts/demo-day.cjs` en el backend (después del seed).

## Seguridad: patrón BFF

El navegador **nunca ve los tokens**. El login lo hace el servidor de Next.js, que guarda los
tokens en cookies `httpOnly` + `SameSite=Lax`; todas las llamadas pasan por `/api/backend/*`,
que agrega el token y lo renueva (una sola vez aunque lleguen muchas peticiones a la vez).

- `src/lib/server/tokens.ts`: cookies, renovación compartida, protección CSRF (`Sec-Fetch-Site`).
- `src/app/api/backend/[...path]/route.ts`: proxy al backend; retira tokens de toda respuesta.
- `src/proxy.ts` (antes "middleware"): sin sesión → login; renueva el token antes de renderizar
  (las páginas de servidor no pueden escribir cookies).

## Pruebas de punta a punta (navegador real)

Requieren backend y panel corriendo con el seed + `scripts/demo-day.cjs` recién aplicados:

```bash
npx playwright install chromium
pnpm build && pnpm start -p 3100      # en otra terminal
pnpm test:e2e
```

`PANEL_URL` y `API_URL` cambian las direcciones (por defecto `localhost:3100` y `localhost:3000`).
`ONLY=stores,shifts,users,audit,platform node tests/e2e/admin.e2e.cjs` corre solo esas secciones.

## Docker

```bash
docker build -t asistencia-web .
docker run -p 3100:3100 -e BACKEND_URL=http://<api>:3000/api/v1 asistencia-web
```

La imagen usa la salida `standalone` de Next.js. `BACKEND_URL` y `COOKIE_SECURE` se leen al
arrancar. En `docker-compose.prod.yml` del backend ya está el servicio `web`.
