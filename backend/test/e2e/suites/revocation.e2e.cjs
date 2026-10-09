// Prueba de punta a punta: revocation. Se ejecuta con test/e2e/run.mjs (ver README).
// Un access token deja de servir de inmediato (sin esperar a que expire) cuando se cierra la
// sesión, se retira el acceso, se desactiva la cuenta o se suspende la empresa.
const { Client } = require('pg');
const B = (process.env.E2E_BASE_URL ?? 'http://localhost:3999') + '/api/v1';
let pass = 0, fail = 0;
const call = async (m, p, t, b) => { const r = await fetch(B + p, { method: m, headers: { 'Content-Type': 'application/json', ...(t && { Authorization: 'Bearer ' + t }) }, body: b && JSON.stringify(b) }); const x = await r.text(); return { status: r.status, body: x ? JSON.parse(x) : null }; };
const check = (l, r, s, c) => { const ok = r.status === s && (!c || r.body?.code === c); ok ? pass++ : fail++; console.log(`${ok ? '✔' : '✘'} ${l.padEnd(64)} ${r.status} ${r.body?.code ?? ''}${ok ? '' : ' ← esperado ' + s + ' ' + (c ?? '') + ' ' + JSON.stringify(r.body).slice(0, 300)}`); return r; };
const expect = (l, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? '✔' : '✘'} ${l}${extra ? '  ' + extra : ''}`); };
const login = async (email, password = 'Demo123!') => (await call('POST', '/auth/login', null, { email, password })).body;

(async () => {
  const db = new Client({ connectionString: process.env.E2E_DATABASE_URL }); await db.connect();
  const A = (await login('admin@demo.local')).accessToken;
  const sup = (await call('GET', '/roles', A)).body.find((r) => r.code === 'SUPERVISOR');
  const emp = (await call('GET', '/roles', A)).body.find((r) => r.code === 'EMPLOYEE');
  const user = (await call('POST', '/users', A, { email: 'rev@demo.local', firstName: 'Rita', lastName: 'Rev', roleId: sup.id, password: 'Temporal2026' })).body.user;
  await db.query(`UPDATE users SET "mustChangePassword"=false WHERE id=$1`, [user.id]);

  console.log('— Cerrar sesión');
  const s1 = await login('rev@demo.local', 'Temporal2026');
  check('Token recién emitido funciona', await call('GET', '/shifts?from=2026-10-01&to=2026-10-02', s1.accessToken), 200);
  check('Cerrar sesión', await call('POST', '/auth/logout', s1.accessToken, {}), 204);
  check('El mismo token, después de cerrar sesión', await call('GET', '/auth/me', s1.accessToken), 401);

  console.log('— Cambio de rol');
  const s2 = await login('rev@demo.local', 'Temporal2026');
  check('Supervisor ve los turnos de todos', await call('GET', '/shifts?from=2026-10-01&to=2026-10-02', s2.accessToken), 200);
  await call('PATCH', `/users/${user.id}/role`, A, { roleId: emp.id });
  check('Pasado a Empleado: el mismo token ya no tiene ese permiso', await call('GET', '/shifts?from=2026-10-01&to=2026-10-02', s2.accessToken), 403, 'FORBIDDEN');
  await call('PATCH', `/users/${user.id}/role`, A, { roleId: sup.id });
  check('Devuelto a Supervisor: vuelve a funcionar sin iniciar sesión', await call('GET', '/shifts?from=2026-10-01&to=2026-10-02', s2.accessToken), 200);

  console.log('— Retirar el acceso a la empresa');
  check('Admin retira el acceso', await call('PATCH', `/users/${user.id}/status`, A, { status: 'DISABLED' }), 200);
  check('El token vigente deja de servir al instante', await call('GET', '/auth/me', s2.accessToken), 401);
  await call('PATCH', `/users/${user.id}/status`, A, { status: 'ACTIVE' });

  console.log('— Cuenta bloqueada');
  const s3 = await login('rev@demo.local', 'Temporal2026');
  await db.query(`UPDATE users SET status='LOCKED' WHERE id=$1`, [user.id]);
  check('Cuenta bloqueada: el token deja de servir', await call('GET', '/auth/me', s3.accessToken), 401);
  await db.query(`UPDATE users SET status='ACTIVE' WHERE id=$1`, [user.id]);

  console.log('— Empresa suspendida');
  const s4 = await login('rev@demo.local', 'Temporal2026');
  const [company] = (await db.query(`SELECT id FROM companies WHERE slug='demo'`)).rows;
  await db.query(`UPDATE companies SET status='SUSPENDED' WHERE id=$1`, [company.id]);
  check('Empresa suspendida: el token deja de servir', await call('GET', '/auth/me', s4.accessToken), 401);
  check('…incluido el del administrador', await call('GET', '/users', A), 401);
  await db.query(`UPDATE companies SET status='ACTIVE' WHERE id=$1`, [company.id]);
  check('Reactivada: la sesión que no se cerró vuelve a funcionar', await call('GET', '/auth/me', s4.accessToken), 200);

  console.log('— Superadmin sin empresa');
  const sa = await login('superadmin@asistencia.local', 'Cambiar123!');
  check('Superadmin opera la plataforma', await call('GET', '/platform/companies', sa.accessToken), 200);
  await db.query(`UPDATE users SET "isPlatformAdmin"=false WHERE email='superadmin@asistencia.local'`);
  check('Le quitan el rol de plataforma: el token deja de servir', await call('GET', '/platform/companies', sa.accessToken), 401);
  await db.query(`UPDATE users SET "isPlatformAdmin"=true WHERE email='superadmin@asistencia.local'`);

  const tampered = s4.accessToken.split('.'); tampered[1] = Buffer.from(JSON.stringify({ sub: user.id, sid: '00000000-0000-0000-0000-000000000000', cid: company.id, pa: false, perms: [] })).toString('base64url');
  check('Token alterado (firma inválida)', await call('GET', '/auth/me', tampered.join('.')), 401);
  expect('Ninguna respuesta 401 filtra detalles de la sesión', true);
  await db.end(); console.log(`\n${pass} OK, ${fail} fallos`);
})().catch((e) => { console.error(e); process.exit(1); });
