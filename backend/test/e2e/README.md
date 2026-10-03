# Pruebas de punta a punta

11 suites, unas 400 verificaciones contra PostgreSQL real: autenticación y seguridad, empresas,
establecimientos, turnos, cambios de turno, asistencia, novedades, notificaciones, reportes,
importación y endurecimiento.

## Ejecutar

```bash
# 1. Una base SOLO para pruebas (cada suite la borra). Su nombre debe contener "test".
docker compose exec postgres createdb -U attendance attendance_test

# 2. Compilar y correr
pnpm run build
E2E_DATABASE_URL=postgresql://attendance:attendance_dev@localhost:5432/attendance_test pnpm test:e2e

# Solo algunas suites
pnpm test:e2e security reports
```

En PowerShell: `$env:E2E_DATABASE_URL="postgresql://..."; pnpm test:e2e`

## Qué hace el ejecutor (`run.mjs`)

Por cada suite: `prisma migrate reset` + seed en la base de pruebas, arranca `dist/main.js` con la
configuración que esa suite necesita (por ejemplo, procesos periódicos cada segundo), espera
`/health/ready`, corre la suite y detiene el backend. Si algo falla, muestra los pasos fallidos y la
ruta del log del backend.

Se niega a correr si el nombre de la base no contiene "test".
