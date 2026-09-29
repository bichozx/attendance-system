# Sistema de control de asistencia y turnos

Backend REST multiempresa para administrar usuarios, empleados, sedes, turnos y asistencia. Implementado con NestJS, TypeScript, PostgreSQL y Prisma 7. La API está versionada y expone contratos Swagger para clientes web y móviles.

## Estado de auditoría

La funcionalidad principal para el cliente móvil ya está modelada. La compilación pasa tras corregir las rutas de importación; las pruebas todavía deben quedar verdes antes de iniciar la integración.

1. **Verificado: compilación.** Se corrigieron las rutas al helper compartido `src/shared/presentation/date-range.ts`. `pnpm run build` pasa.
2. **Bloqueante: pruebas.** Con Node `v22.19.0`, Jest falla al cargar módulos ESM de NestJS (`Must use import to load ES Module`). La prueba unitaria reporta 78 pruebas exitosas en 7 suites y una suite que no inicia; e2e tampoco inicia. Revisar la configuración ESM de Jest o usar un runtime compatible con Jest y las dependencias instaladas.
3. **Mantenimiento.** `pnpm run lint` termina con advertencias por imports/parámetros sin uso y patrones de spread/métodos sin enlazar. No bloquean lint, pero conviene limpiarlas antes de exigirlo en CI.

Los controladores y módulos que ya estaban sin seguimiento en el workspace se conservaron sin cambios.

## Requisitos y configuración

- Node.js y pnpm.
- PostgreSQL accesible desde el backend.
- Crear un archivo `.env` local con las variables necesarias:

```dotenv
DATABASE_URL="postgresql://usuario:clave@localhost:5432/attendance?schema=public"
JWT_ACCESS_SECRET="reemplazar-por-un-secreto-aleatorio-largo"
PORT=3000
NODE_ENV=development
CORS_ORIGINS=http://localhost:3001
TRUST_PROXY_HOPS=0
SWAGGER_ENABLED=true
JWT_ACCESS_TTL_SECONDS=900
REFRESH_TOKEN_TTL_DAYS=30
ATTENDANCE_JOB_INTERVAL_SECONDS=300
```

`DATABASE_URL` y `JWT_ACCESS_SECRET` son obligatorios. Los demás valores tienen defaults en el código. `CORS_ORIGINS` acepta orígenes separados por coma y se usa principalmente para clientes web; apps nativas no suelen estar sujetas a CORS, pero necesitan una dirección de backend accesible desde el dispositivo.

## Instalación y ejecución

Desde este directorio:

```bash
pnpm install
pnpm exec prisma migrate dev
pnpm exec prisma generate
pnpm run start:dev
```

La API local usa `http://localhost:3000/api/v1`. Swagger está en `http://localhost:3000/api/docs` cuando está habilitado. Para desplegar, aplicar migraciones ya versionadas con `pnpm exec prisma migrate deploy`.

Para emuladores, configura la URL base del cliente según el entorno: Android Emulator suele alcanzar el host mediante `10.0.2.2`; iOS Simulator suele poder usar `localhost`; un dispositivo físico debe usar la IP LAN del equipo donde corre el backend.

## API para la app móvil

Las rutas se agregan a `/api/v1`. Salvo login y refresh, requieren `Authorization: Bearer <accessToken>` y permisos del usuario para la empresa activa.

| Método | Ruta | Uso |
| --- | --- | --- |
| `POST` | `/auth/login` | Login; si hay varias empresas, responde `409 COMPANY_SELECTION_REQUIRED`, luego repetir con `companyId`. |
| `POST` | `/auth/refresh` | Rotar access token y refresh token. |
| `POST` | `/auth/logout` | Cerrar la sesión actual o todas las sesiones. |
| `GET` | `/auth/me` | Usuario, empresa activa y permisos. |
| `GET` | `/me/attendance/status` | Jornada abierta y próximo turno. |
| `GET` | `/me/attendance?from=YYYY-MM-DD&to=YYYY-MM-DD` | Historial paginado; máximo 62 días. |
| `POST` | `/me/attendance/clock-in` | Registrar entrada con ubicación e idempotency key. |
| `POST` | `/me/attendance/clock-out` | Registrar salida con ubicación e idempotency key. |
| `POST` | `/me/attendance/sync` | Sincronizar de 1 a 20 marcaciones offline. |
| `GET` | `/me/shifts?from=YYYY-MM-DD&to=YYYY-MM-DD` | Turnos de periodos publicados. |

### Sesión y empresa activa

Login devuelve `accessToken`, `accessTokenExpiresIn`, `refreshToken`, `refreshTokenExpiresAt`, `user` y `company`. `/auth/me` devuelve además `permissions`; sirven para adaptar la interfaz, pero la autorización siempre corresponde al backend.

Guardar el refresh token en almacenamiento seguro del dispositivo (SecureStore/Keychain/Keystore), nunca en almacenamiento plano. El refresh rota ambos tokens: serializar renovaciones y no enviar refresh concurrentes con el mismo token, porque la reutilización revoca la sesión.

### Marcaciones y modo sin conexión

Una marcación online requiere `latitude`, `longitude`, `accuracyMeters` e `idempotencyKey` UUID; `device` y `mocked` son opcionales. En una entrada puede enviarse `shiftId`. Una respuesta HTTP `200` no implica aceptación: comprobar `accepted` y `rejection`. La hora oficial es la del servidor.

Para sincronizar, enviar `deviceNow` y `events`; cada evento lleva `type`, `clientTimestamp`, los campos de ubicación y una clave idempotente única. Reintentar con la misma clave evita duplicados. El servidor ajusta el desfase del reloj del dispositivo y aplica las reglas de turno y geocerca. La app debe persistir la cola pendiente y reintentarla en orden.

Los timestamps son ISO 8601 con zona horaria. Las fechas de consulta son fechas de jornada `YYYY-MM-DD`, no instantes UTC. El backend calcula turnos con la zona horaria de la sede/empresa.

### Errores y paginación

Los errores usan `{ statusCode, code, message, details? }`. Errores de DTO usan `code: VALIDATION_ERROR` y `details.errors`. La respuesta paginada incluye `items`, `total`, `page`, `pageSize` y `totalPages`. Para la lógica del cliente, usar `code` y no el texto variable de `message`.

## Módulos

- `auth`: login, selección de empresa, JWT, refresh rotativo y permisos.
- `employees`, `users`, `roles`, `stores`: personal, acceso, sedes y geocercas.
- `shifts`: periodos de programación y turnos.
- `attendance`: marcaciones, sync offline, historial, revisión y cierre automático.
- `incidents`: novedades relacionadas con la asistencia.
- `shared`: persistencia, auditoría, notificaciones, fechas y errores HTTP.

El sistema es multiempresa. Todas las operaciones de negocio deben conservar el contexto `companyId` y la autorización correspondiente; no consultar datos solo por ID desde el cliente.

## Comandos de calidad

```bash
pnpm run build
pnpm run lint
pnpm test -- --runInBand
pnpm run test:e2e -- --runInBand
```

Resultados observados: build pasa; lint completa con advertencias; unit y e2e están limitados por la carga ESM de Jest bajo Node 22.19.0. Repetir los cuatro comandos después de resolver Jest, antes de integrar el cliente móvil.

## Próximos pasos recomendados

1. Resolver ESM de Jest y recuperar pruebas unitarias/e2e en CI.
2. Versionar el OpenAPI generado como contrato del cliente; agregar pruebas de contrato para auth, marcaciones y sync.
3. Implementar primero login/empresa, estado y turnos; después marcación online, permisos de ubicación, cola offline y reintentos idempotentes.