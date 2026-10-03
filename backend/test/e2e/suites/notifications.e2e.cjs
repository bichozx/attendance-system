// Prueba de punta a punta: notifications. Se ejecuta con test/e2e/run.mjs (ver README).
const { Client } = require('pg');
const { hash } = require('@node-rs/argon2');
const fs = require('fs');
const B = (process.env.E2E_BASE_URL ?? 'http://localhost:3999') + '/api/v1';
let pass = 0, fail = 0;
const call = async (m, p, t, b) => { const r = await fetch(B + p, { method: m, headers: { 'Content-Type': 'application/json', ...(t && { Authorization: 'Bearer ' + t }) }, body: b && JSON.stringify(b) }); const x = await r.text(); return { status: r.status, body: x ? JSON.parse(x) : null }; };
const check = (l, r, s, c) => { const ok = r.status === s && (!c || r.body?.code === c); ok ? pass++ : fail++; console.log(`${ok ? '✔' : '✘'} ${l.padEnd(64)} ${r.status} ${r.body?.code ?? ''}${ok ? '' : ' ← esperado ' + s + ' ' + (c ?? '') + ' ' + JSON.stringify(r.body).slice(0, 250)}`); return r; };
const expect = (l, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? '✔' : '✘'} ${l}${extra ? '  ' + extra : ''}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const login = (email) => call('POST', '/auth/login', null, { email, password: 'Demo123!' });
const local = (ms) => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(ms)).map(x => [x.type, x.value])); return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` }; };
const pushes = () => (fs.readFileSync(process.env.E2E_APP_LOG, 'utf8').match(/📱 PUSH[^\n]*/g) ?? []);

(async () => {
  const db = new Client({ connectionString: process.env.E2E_DATABASE_URL }); await db.connect();
  const q = async (s, p) => (await db.query(s, p)).rows;
  const [compB] = await q(`INSERT INTO companies (id,name,slug,status,"updatedAt") VALUES (gen_random_uuid(),'Empresa B','empresa-b','ACTIVE',now()) RETURNING id`);
  const [admRole] = await q(`SELECT id FROM roles WHERE code='COMPANY_ADMIN' AND "companyId" IS NULL`);
  const [uB] = await q(`INSERT INTO users (id,email,"passwordHash","firstName","lastName","updatedAt") VALUES (gen_random_uuid(),'admin@b.local',$1,'Beto','B',now()) RETURNING id`, [await hash('Demo123!')]);
  await db.query(`INSERT INTO company_memberships (id,"companyId","userId","roleId","updatedAt") VALUES (gen_random_uuid(),$1,$2,$3,now())`, [compB.id, uB.id, admRole.id]);
  const [empB] = await q(`INSERT INTO employees (id,"companyId",code,"documentType","documentNumber","firstName","lastName","hireDate","updatedAt") VALUES (gen_random_uuid(),$1,'B1','CC','999','Bruno','B','2026-01-01',now()) RETURNING id`, [compB.id]);

  const A = (await login('admin@demo.local')).body.accessToken;
  const C1 = (await login('empleado@demo.local')).body;
  const C2 = (await login('empleado@demo.local')).body; // segundo teléfono
  const TB = (await login('admin@b.local')).body.accessToken;
  const [carlos] = await q(`SELECT id, "userId", "companyId" FROM employees WHERE code='EMP-001'`);
  const [store] = await q(`SELECT id FROM stores WHERE code='CENTRO'`);

  console.log('— Dispositivos');
  check('Carlos registra su teléfono', await call('POST', '/me/devices', C1.accessToken, { token: 'ExponentPushToken[carlos-phone]', platform: 'ANDROID' }), 204);
  await call('POST', '/me/devices', C1.accessToken, { token: 'ExponentPushToken[UNREGISTERED-old-phone]', platform: 'ANDROID' });
  await call('POST', '/me/devices', C1.accessToken, { token: 'ExponentPushToken[RECEIPT-GONE-tablet]', platform: 'IOS' });
  check('…y otro teléfono con otra sesión', await call('POST', '/me/devices', C2.accessToken, { token: 'ExponentPushToken[second-phone]', platform: 'IOS' }), 204);
  check('Cierra sesión en el segundo teléfono', await call('POST', '/auth/logout', C2.accessToken, {}), 204);
  check('Token inválido (muy corto)', await call('POST', '/me/devices', C1.accessToken, { token: 'x', platform: 'ANDROID' }), 400, 'VALIDATION_ERROR');

  console.log('— Recordatorios automáticos');
  const s = local(Date.now() + 4 * 60_000), e = local(Date.now() + 8 * 3600_000);
  await call('POST', '/shifts', A, { storeId: store.id, date: s.date, startTime: s.time, endTime: e.time, employeeIds: [carlos.id] });
  // Turno que empezó hace 12 min sin entrada, y otro que terminó hace 5 min con la jornada abierta
  const mk = async (startOff, endOff) => {
    const [sh] = await q(`INSERT INTO shifts (id,"companyId","storeId","startsAt","endsAt","lateToleranceMinutes","updatedAt") VALUES (gen_random_uuid(),$1,$2,now()+($3||' minutes')::interval,now()+($4||' minutes')::interval,5,now()) RETURNING id`, [carlos.companyId, store.id, startOff, endOff]);
    const [a] = await q(`INSERT INTO shift_assignments (id,"companyId","shiftId","employeeId","updatedAt") VALUES (gen_random_uuid(),$1,$2,$3,now()) RETURNING id`, [carlos.companyId, sh.id, carlos.id]);
    return a.id;
  };
  await mk(-12, 240);
  const ended = await mk(-480, -5);
  await q(`INSERT INTO attendances (id,"companyId","shiftAssignmentId","employeeId","workDate",status,"clockInAt","updatedAt") VALUES (gen_random_uuid(),$1,$2,$3,current_date,'IN_PROGRESS',now()-interval '479 minutes',now())`, [carlos.companyId, ended, carlos.id]);
  await sleep(4000);
  const rem = await q(`SELECT type, title, body, status, "pushedDevices", "lastError" FROM notifications WHERE "dedupeKey" IS NOT NULL ORDER BY type`);
  rem.forEach(r => console.log(`     🔔 [${r.type}] ${r.title} — ${r.body}  → ${r.status}, ${r.pushedDevices} dispositivo(s)`));
  expect('Los 3 recordatorios se generaron y enviaron', rem.length === 3 && rem.every(r => r.status === 'SENT'));
  expect('Push solo a los teléfonos con sesión activa (no al de la sesión cerrada)', rem.every(r => r.pushedDevices === 2));
  await sleep(3000);
  const [{ n: dup }] = await q(`SELECT count(*)::int n FROM notifications WHERE "dedupeKey" IS NOT NULL`);
  expect(`Sin duplicados tras varias vueltas del proceso (${dup})`, dup === 3);

  console.log('— Limpieza de dispositivos inexistentes');
  let tokens = (await q(`SELECT token FROM device_tokens WHERE "userId"=$1 ORDER BY token`, [carlos.userId])).map(t => t.token);
  expect('El teléfono desinstalado se borró al primer envío (error inmediato)', !tokens.some(t => t.includes('UNREGISTERED')), tokens.join(', '));
  await q(`UPDATE push_tickets SET "createdAt"=now()-interval '20 minutes'`);
  await sleep(3500);
  tokens = (await q(`SELECT token FROM device_tokens WHERE "userId"=$1 ORDER BY token`, [carlos.userId])).map(t => t.token);
  expect('La tableta reportada por el recibo posterior también se borró', !tokens.some(t => t.includes('RECEIPT-GONE')), tokens.join(', '));
  const [{ n: left }] = await q(`SELECT count(*)::int n FROM push_tickets`);
  expect(`Recibos procesados y eliminados (quedan ${left})`, left === 0);

  console.log('— Bandeja');
  const inbox = check('Carlos consulta su bandeja', await call('GET', '/me/notifications', C1.accessToken), 200);
  console.log(`     ${inbox.body.total} notificaciones: ${inbox.body.items.map(i => i.type).join(', ')}`);
  let unread = (await call('GET', '/me/notifications/unread-count', C1.accessToken)).body.unread;
  check('Marcar una como leída', await call('POST', `/me/notifications/${inbox.body.items[0].id}/read`, C1.accessToken), 204);
  const after = (await call('GET', '/me/notifications/unread-count', C1.accessToken)).body.unread;
  expect(`     sin leer: ${unread} → ${after}`, after === unread - 1);
  const onlyUnread = (await call('GET', '/me/notifications?unreadOnly=true', C1.accessToken)).body;
  expect('Filtro "solo sin leer"', onlyUnread.items.every(i => i.readAt === null) && onlyUnread.total === after);
  check('El admin intenta marcar una notificación de Carlos', await call('POST', `/me/notifications/${inbox.body.items[1].id}/read`, A), 404, 'NOTIFICATION_NOT_FOUND');
  check('Marcar todas', await call('POST', '/me/notifications/read-all', C1.accessToken), 200);
  expect('     sin leer: 0', (await call('GET', '/me/notifications/unread-count', C1.accessToken)).body.unread === 0);
  expect('Empresa B no ve notificaciones de A', (await call('GET', '/me/notifications', TB)).body.total === 0);

  console.log('— Avisos administrativos');
  const all = check('Aviso a toda la empresa', await call('POST', '/notifications/announcements', A, { title: 'Inventario el sábado', body: 'Abrimos a las 10:00. Llega 30 minutos antes.' }), 201);
  const byStore = check('Aviso solo a quienes tienen sede Tienda Centro', await call('POST', '/notifications/announcements', A, { title: 'Cambio de llaves', body: 'Recoge la llave nueva con tu supervisor.', storeIds: [store.id] }), 201);
  console.log(`     destinatarios: toda la empresa ${all.body.recipients} · Tienda Centro ${byStore.body.recipients}`);
  check('Empleado de OTRA empresa como destinatario', await call('POST', '/notifications/announcements', A, { title: 'Hola', body: 'Prueba', employeeIds: [empB.id] }), 400, 'EMPTY_AUDIENCE');
  check('Empleado intenta enviar un aviso', await call('POST', '/notifications/announcements', C1.accessToken, { title: 'Hola', body: 'Prueba' }), 403, 'FORBIDDEN');
  await sleep(2500);
  const ann = await q(`SELECT status, "pushedDevices" FROM notifications WHERE type='ADMIN_ANNOUNCEMENT' AND "userId"=$1`, [carlos.userId]);
  expect('Los avisos a Carlos salieron por push', ann.length === 2 && ann.every(a => a.status === 'SENT' && a.pushedDevices === 1));

  console.log('— Lo que ya generaban otros módulos ahora llega por push');
  const pend = (await call('POST', '/me/incidents', C1.accessToken, { type: 'OTHER', startDate: s.date, description: 'Necesito salir temprano' })).body;
  await call('POST', `/incidents/${pend.id}/approve`, A, { notes: 'Aprobado' });
  await sleep(2500);
  const [res] = await q(`SELECT title, status, "pushedDevices" FROM notifications WHERE type='INCIDENT_RESOLVED' AND "userId"=$1`, [carlos.userId]);
  expect(`"${res?.title}" → ${res?.status}`, res?.status === 'SENT' && res?.pushedDevices === 1);
  console.log(`\n     Últimos push en la consola del backend:`);
  pushes().slice(-3).forEach(p => console.log('     ' + p.slice(0, 130)));
  await db.end(); console.log(`\n${pass} OK, ${fail} fallos`);
})().catch(e => { console.error(e); process.exit(1); });
