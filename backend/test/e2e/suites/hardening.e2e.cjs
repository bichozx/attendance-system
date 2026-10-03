// Prueba de punta a punta: hardening. Se ejecuta con test/e2e/run.mjs (ver README).
const { Client } = require('pg');
const fs = require('fs');
const ROOT = process.env.E2E_BASE_URL ?? 'http://localhost:3999';
const B = ROOT + '/api/v1';
const DB = process.env.E2E_DATABASE_URL ?? process.env.E2E_DATABASE_URL;
const LOG = process.env.E2E_APP_LOG ?? process.env.E2E_APP_LOG;
let pass = 0, fail = 0;
const expect = (l, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? '✔' : '✘'} ${l}${extra ? '  ' + extra : ''}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const db = new Client({ connectionString: DB }); await db.connect();
  const q = async (s, p) => (await db.query(s, p)).rows;

  console.log('— Salud');
  const live = await fetch(ROOT + '/health/live');
  expect(`/health/live responde ${live.status} sin autenticación`, live.status === 200);
  const ready = await (await fetch(ROOT + '/health/ready')).json();
  expect(`/health/ready: base de datos ${ready.details?.database?.status}`, ready.status === 'ok' && ready.details.database.status === 'up');
  const versioned = await fetch(B + '/health/live');
  expect('el health check no vive bajo /api/v1', versioned.status === 404);

  console.log('— Trazabilidad');
  const r1 = await fetch(B + '/auth/me');
  expect(`cada respuesta trae x-request-id (${r1.headers.get('x-request-id')?.slice(0, 8)}…)`, /^[\w-]{8,}$/.test(r1.headers.get('x-request-id') ?? ''));
  const r2 = await fetch(B + '/auth/me', { headers: { 'x-request-id': 'ticket-soporte-777' } });
  expect('respeta el id que envía el cliente', r2.headers.get('x-request-id') === 'ticket-soporte-777');
  const r3 = await fetch(B + '/auth/me', { headers: { 'x-request-id': 'malo; DROP TABLE' } });
  expect('ignora ids con caracteres no permitidos', r3.headers.get('x-request-id') !== 'malo; DROP TABLE');

  console.log('— Los logs no guardan secretos');
  const login = await (await fetch(B + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@demo.local', password: 'Demo123!' }) })).json();
  await fetch(B + '/auth/me', { headers: { Authorization: 'Bearer ' + login.accessToken } });
  await fetch(B + '/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: login.refreshToken }) });
  await sleep(500);
  const log = fs.readFileSync(LOG, 'utf8');
  expect('ni la contraseña, ni el access token, ni el refresh token aparecen en el log',
    !log.includes('Demo123!') && !log.includes(login.accessToken) && !log.includes(login.refreshToken.split('.')[1]));

  console.log('— Retención de datos (proceso de mantenimiento)');
  const [emp] = await q(`SELECT id, "companyId" FROM employees WHERE code='EMP-001'`);
  const [user] = await q(`SELECT id FROM users WHERE email='empleado@demo.local'`);
  const [ev] = await q(`INSERT INTO attendance_events (id,"companyId","employeeId",type,result,"serverTimestamp",latitude,longitude,"accuracyMeters","distanceMeters","withinGeofence") VALUES (gen_random_uuid(),$1,$2,'CLOCK_IN','ACCEPTED',now()-interval '400 days',4.6,-74.08,10,15,true) RETURNING id`, [emp.companyId, emp.id]);
  const [recent] = await q(`INSERT INTO attendance_events (id,"companyId","employeeId",type,result,latitude,longitude,"accuracyMeters") VALUES (gen_random_uuid(),$1,$2,'CLOCK_IN','ACCEPTED',4.6,-74.08,10) RETURNING id`, [emp.companyId, emp.id]);
  await q(`INSERT INTO notifications (id,"companyId","userId",type,title,body,"createdAt") VALUES (gen_random_uuid(),$1,$2,'ADMIN_ANNOUNCEMENT','Viejo','x',now()-interval '200 days')`, [emp.companyId, user.id]);
  await q(`INSERT INTO audit_logs (id,"companyId",action,"entityType","entityId","createdAt") VALUES (gen_random_uuid(),$1,'employee.created','Employee',$2,now()-interval '5 years')`, [emp.companyId, emp.id]);
  await q(`INSERT INTO sessions (id,"userId","refreshTokenHash","expiresAt","revokedAt") VALUES (gen_random_uuid(),$1,'viejo-'||gen_random_uuid(),now()-interval '60 days',now()-interval '60 days')`, [user.id]);
  await sleep(3500); // el mantenimiento corre cada 2 s en esta suite
  const [old] = await q(`SELECT latitude, longitude, "accuracyMeters", "withinGeofence", type, result FROM attendance_events WHERE id=$1`, [ev.id]);
  expect(`marcación de hace 400 días: sin coordenadas, pero conserva la evidencia (${old.type} ${old.result}, dentro=${old.withinGeofence})`,
    old.latitude === null && old.longitude === null && old.accuracyMeters === null && old.withinGeofence === true);
  const [fresh] = await q(`SELECT latitude FROM attendance_events WHERE id=$1`, [recent.id]);
  expect('la marcación reciente conserva su ubicación', fresh.latitude !== null);
  const [{ n: oldNotif }] = await q(`SELECT count(*)::int n FROM notifications WHERE title='Viejo'`);
  const [{ n: oldSess }] = await q(`SELECT count(*)::int n FROM sessions WHERE "refreshTokenHash" LIKE 'viejo-%'`);
  expect('notificación de hace 200 días y sesión vencida hace 60 días: eliminadas', oldNotif === 0 && oldSess === 0);
  const [{ n: audit }] = await q(`SELECT count(*)::int n FROM audit_logs WHERE "createdAt" < now() - interval '4 years'`);
  expect('la auditoría nunca se borra (el registro de hace 5 años sigue ahí)', audit === 1);

  await db.end(); console.log(`\n${pass} OK, ${fail} fallos`);
})().catch(e => { console.error(e); process.exit(1); });
