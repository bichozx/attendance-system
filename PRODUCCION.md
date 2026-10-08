# Lista de verificación para producción

## Antes del primer despliegue
- [ ] `backend/.env.production` completo (parta de `.env.production.example`). La API **no arranca**
      si falta algo obligatorio o inseguro, y dice exactamente qué corregir.
- [ ] `JWT_ACCESS_SECRET` aleatorio de 48+ caracteres, distinto al de desarrollo.
- [ ] Correo real (`MAIL_TRANSPORT=smtp`): sin él nadie recupera su contraseña ni activa su cuenta.
- [ ] `PUSH_PROVIDER=expo` y credenciales de FCM cargadas en Expo (para Android).
- [ ] HTTPS delante de la API (Caddy, Nginx, Cloudflare o el balanceador de su proveedor) y
      `TRUST_PROXY_HOPS` igual al número de proxies.
- [ ] `CORS_ORIGINS` con la URL exacta del panel web.
- [ ] HTTPS también delante del panel (puerto 3100): sus cookies de sesión son `Secure` y el
      navegador no las guarda por HTTP.
- [ ] Copias de seguridad automáticas de PostgreSQL (diarias, con prueba de restauración).
- [ ] Cambiar la contraseña del superadministrador creado por el seed.

## Desplegar
```bash
docker compose -f docker-compose.prod.yml up -d --build
```
Orden automático: PostgreSQL y Redis sanos → migraciones (`prisma migrate deploy`) → API → panel web.

El panel (`web`, puerto 3100) solo necesita `BACKEND_URL`, que en el compose ya apunta a la API por la
red interna. Se lee al arrancar: cambiarlo no requiere reconstruir la imagen.

## Operación
| Qué | Dónde |
|---|---|
| ¿Vivo? (reiniciar si falla) | `GET /health/live` |
| ¿Listo? (dejar de enviar tráfico si falla) | `GET /health/ready` (detalla base de datos y Redis) |
| Rastrear un error reportado | Buscar su `x-request-id` en los logs (JSON) |
| Retención de datos | Coordenadas GPS: `LOCATION_RETENTION_DAYS` (365). Notificaciones: 180 días. La auditoría no se borra. |

## Varias instancias
Con `REDIS_URL`, el límite de intentos de login es compartido. Los procesos periódicos (cierre de
jornadas, notificaciones, recordatorios, mantenimiento) son seguros con varias instancias: usan
bloqueos de PostgreSQL y nunca procesan dos veces lo mismo.
