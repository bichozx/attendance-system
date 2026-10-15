#!/usr/bin/env node
/**
 * Envía una notificación de PRUEBA a los teléfonos de una cuenta, directo por Expo
 * (sin pasar por la API). Sirve para saber si el problema es del teléfono/app o del backend.
 *
 *   node scripts/test-push.cjs empleado@demo.local
 *   node scripts/test-push.cjs empleado@demo.local --canal default   (probar otro canal)
 *   node scripts/test-push.cjs --todos     (lista qué cuenta tiene registrado cada teléfono)
 *
 * Usa DATABASE_URL del entorno o de backend/.env (para Render: export DATABASE_URL=...).
 */
require('dotenv/config');
const { Client } = require('pg');

const CHANNEL_DEFAULT = 'avisos-v1'; // debe coincidir con mobile/src/services/push.ts
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const args = process.argv.slice(2);
  const email = args.find((a) => !a.startsWith('--'));
  const i = args.indexOf('--canal');
  const channelId = i >= 0 ? args[i + 1] : CHANNEL_DEFAULT;
  if (args.includes('--todos')) {
    if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL.');
    return listAll();
  }
  if (!email) {
    console.error('Uso: node scripts/test-push.cjs <correo> [--canal <id>]');
    process.exit(2);
  }
  if (!process.env.DATABASE_URL) {
    console.error('Falta DATABASE_URL.');
    process.exit(2);
  }

  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const { rows } = await db.query(
    `SELECT d.token, d.platform, d."lastSeenAt", d."sessionId",
            s."revokedAt" AS "sessionRevokedAt", s."expiresAt" AS "sessionExpiresAt"
       FROM device_tokens d
       JOIN users u ON u.id = d."userId"
       LEFT JOIN sessions s ON s.id = d."sessionId"
      WHERE lower(u.email) = lower($1)
      ORDER BY d."lastSeenAt" DESC`,
    [email],
  );
  await db.end();

  console.log(`Base: ${new URL(process.env.DATABASE_URL).host}`);
  if (!rows.length) {
    console.log(`✖ ${email} no tiene ningún teléfono registrado para push.`);
    console.log('  → Abre la app con esa cuenta, acepta el permiso de notificaciones y vuelve a intentar.');
    process.exit(1);
  }
  for (const r of rows) {
    const session = !r.sessionId
      ? 'sin sesión'
      : r.sessionRevokedAt
        ? 'SESIÓN CERRADA (este teléfono ya no recibe avisos del sistema)'
        : new Date(r.sessionExpiresAt) < new Date()
          ? 'SESIÓN VENCIDA'
          : 'sesión activa';
    console.log(`• ${r.platform} ${r.token.slice(0, 32)}…  visto ${new Date(r.lastSeenAt).toLocaleString('es-CO')}  ${session}`);
  }

  const body = rows.map((r) => ({
    to: r.token,
    title: 'Prueba de sonido 🔔',
    body: `Si escuchas esto, el canal "${channelId}" funciona.`,
    sound: 'default',
    priority: 'high',
    channelId,
    data: { test: true },
  }));
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (process.env.EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
  const send = await (await fetch('https://exp.host/--/api/v2/push/send', { method: 'POST', headers, body: JSON.stringify(body) })).json();
  if (send.errors) {
    console.log('✖ Expo rechazó el envío:', JSON.stringify(send.errors));
    process.exit(1);
  }
  const tickets = send.data;
  tickets.forEach((t, j) =>
    console.log(t.status === 'ok' ? `✔ Enviado a ${rows[j].platform} (ticket ${t.id})` : `✖ ${rows[j].platform}: ${t.message} ${t.details?.error ?? ''}`),
  );

  const ids = tickets.filter((t) => t.status === 'ok').map((t) => t.id);
  if (!ids.length) process.exit(1);
  console.log('… esperando la confirmación de Google (10 s)');
  await sleep(10_000);
  const rec = await (await fetch('https://exp.host/--/api/v2/push/getReceipts', { method: 'POST', headers, body: JSON.stringify({ ids }) })).json();
  for (const id of ids) {
    const r = rec.data?.[id];
    if (!r) console.log(`… ${id}: aún sin confirmación (normal; si el aviso llegó, todo bien)`);
    else if (r.status === 'ok') console.log(`✔ Google lo entregó al teléfono (${id})`);
    else console.log(`✖ ${id}: ${r.message} ${r.details?.error ?? ''}`);
  }
})().catch((e) => {
  console.error('✖', e.message);
  process.exit(1);
});

async function listAll() {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const { rows } = await db.query(
    `SELECT u.email, d.platform, d.token, d."lastSeenAt",
            CASE WHEN s.id IS NULL THEN 'sin sesión'
                 WHEN s."revokedAt" IS NOT NULL THEN 'SESIÓN CERRADA'
                 WHEN s."expiresAt" < now() THEN 'SESIÓN VENCIDA'
                 ELSE 'sesión activa' END AS estado
       FROM device_tokens d JOIN users u ON u.id = d."userId"
       LEFT JOIN sessions s ON s.id = d."sessionId"
      ORDER BY d."lastSeenAt" DESC`,
  );
  await db.end();
  console.log(`Base: ${new URL(process.env.DATABASE_URL).host} · ${rows.length} teléfono(s)`);
  for (const r of rows)
    console.log(`• ${r.email.padEnd(30)} ${r.platform} ${r.token.slice(18, 34)}…  ${new Date(r.lastSeenAt).toLocaleString('es-CO')}  ${r.estado}`);
}
