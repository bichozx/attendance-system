// Prueba de punta a punta: security. Se ejecuta con test/e2e/run.mjs (ver README).
const { Client } = require('pg');
const { hash } = require('@node-rs/argon2');
const fs = require('fs');
const B = (process.env.E2E_BASE_URL ?? 'http://localhost:3999') + '/api/v1';
let pass = 0, fail = 0;
// El ejecutor sube el límite de logins para las pruebas; sin él, hay que esperar el minuto
const RATE_PAUSE = Number(process.env.E2E_RATE_PAUSE_MS ?? 61_000);
const call = async (m, p, t, b) => { const r = await fetch(B + p, { method: m, headers: { 'Content-Type': 'application/json', ...(t && { Authorization: 'Bearer ' + t }) }, body: b && JSON.stringify(b) }); const x = await r.text(); return { status: r.status, body: x ? JSON.parse(x) : null }; };
const check = (l, r, s, c) => { const ok = r.status === s && (!c || r.body?.code === c); ok ? pass++ : fail++; console.log(`${ok ? '✔' : '✘'} ${l.padEnd(64)} ${r.status} ${r.body?.code ?? ''}${ok ? '' : ' ← esperado ' + s + ' ' + (c ?? '') + ' ' + JSON.stringify(r.body).slice(0, 250)}`); return r; };
const expect = (l, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? '✔' : '✘'} ${l}${extra ? '  ' + extra : ''}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const login = (email, password = 'Demo123!') => call('POST', '/auth/login', null, { email, password });
const mails = () => fs.readFileSync(process.env.E2E_APP_LOG, 'utf8').split('──────── CORREO').slice(1);
const lastMailTo = async (to) => { await sleep(400); return mails().filter(m => m.includes(`Para: ${to}`)).at(-1) ?? ''; };
const tokenIn = (mail) => mail.match(/token=([A-Za-z0-9_-]{43})/)?.[1];
const pause = async () => { process.stdout.write('   (pausa por el límite de logins por IP)\n'); await sleep(RATE_PAUSE); };

(async () => {
  const db = new Client({ connectionString: process.env.E2E_DATABASE_URL }); await db.connect();
  const q = async (s, p) => (await db.query(s, p)).rows;
  const [compB] = await q(`INSERT INTO companies (id,name,slug,status,"updatedAt") VALUES (gen_random_uuid(),'Empresa B','empresa-b','ACTIVE',now()) RETURNING id`);
  const [admRole] = await q(`SELECT id FROM roles WHERE code='COMPANY_ADMIN' AND "companyId" IS NULL`);
  const [uB] = await q(`INSERT INTO users (id,email,"passwordHash","firstName","lastName","updatedAt") VALUES (gen_random_uuid(),'admin@b.local',$1,'Beto','B',now()) RETURNING id`, [await hash('Demo123!')]);
  await db.query(`INSERT INTO company_memberships (id,"companyId","userId","roleId","updatedAt") VALUES (gen_random_uuid(),$1,$2,$3,now())`, [compB.id, uB.id, admRole.id]);

  console.log('— Contraseña temporal');
  const adminLogin = (await login('admin@demo.local')).body;
  const A = adminLogin.accessToken;
  const emp = (await call('POST', '/employees', A, { code: 'E-MARIA', documentType: 'CC', documentNumber: '777', firstName: 'María', lastName: 'Gil', email: 'maria@demo.local', hireDate: '2026-01-10' })).body;
  await call('POST', `/employees/${emp.id}/access`, A, { password: 'Temporal2026' });
  const m1 = check('María entra con la contraseña que le dio el admin', await login('maria@demo.local', 'Temporal2026'), 200);
  expect(`     mustChangePassword = ${m1.body.user.mustChangePassword}`, m1.body.user.mustChangePassword === true);
  check('…intenta ver sus turnos', await call('GET', '/me/shifts?from=2026-10-01&to=2026-10-02', m1.body.accessToken), 403, 'PASSWORD_CHANGE_REQUIRED');
  check('…intenta marcar', await call('POST', '/me/attendance/clock-in', m1.body.accessToken, { latitude: 4.6, longitude: -74, accuracyMeters: 5, idempotencyKey: require('crypto').randomUUID() }), 403, 'PASSWORD_CHANGE_REQUIRED');
  check('…sí puede ver su perfil', await call('GET', '/auth/me', m1.body.accessToken), 200);
  const m2 = (await login('maria@demo.local', 'Temporal2026')).body; // otra sesión (otro teléfono)
  check('Cambio con contraseña actual incorrecta', await call('PATCH', '/auth/password', m1.body.accessToken, { currentPassword: 'mala', newPassword: 'MiClave2026' }), 400, 'INVALID_CURRENT_PASSWORD');
  check('Cambio a una contraseña débil', await call('PATCH', '/auth/password', m1.body.accessToken, { currentPassword: 'Temporal2026', newPassword: 'abcdefgh' }), 400, 'VALIDATION_ERROR');
  check('Cambio a la misma contraseña', await call('PATCH', '/auth/password', m1.body.accessToken, { currentPassword: 'Temporal2026', newPassword: 'Temporal2026' }), 400, 'PASSWORD_UNCHANGED');
  const ch = check('Cambio correcto', await call('PATCH', '/auth/password', m1.body.accessToken, { currentPassword: 'Temporal2026', newPassword: 'MiClave2026' }), 200);
  console.log(`     sesiones cerradas en otros dispositivos: ${ch.body.closedSessions}`);
  check('Con el token nuevo ya puede ver sus turnos', await call('GET', '/me/shifts?from=2026-10-01&to=2026-10-02', ch.body.accessToken), 200);
  check('La otra sesión quedó cerrada (refresh)', await call('POST', '/auth/refresh', null, { refreshToken: m2.refreshToken }), 401, 'INVALID_REFRESH_TOKEN');
  expect('Correo de aviso de cambio', (await lastMailTo('maria@demo.local')).includes('Tu contraseña fue cambiada'));

  console.log('— Sesiones abiertas');
  const admin2 = (await login('admin@demo.local')).body; // [4.º login del minuto]
  const sessions = check('Admin lista sus sesiones', await call('GET', '/auth/sessions', A), 200);
  console.log(`     ${sessions.body.length} sesiones · actual: ${sessions.body.filter(s => s.current).length} · empresa: ${sessions.body[0].companyName}`);
  const other = sessions.body.find(s => !s.current);
  check('Cierra la sesión del "teléfono perdido"', await call('DELETE', `/auth/sessions/${other.id}`, A), 204);
  check('Ese teléfono ya no puede renovar', await call('POST', '/auth/refresh', null, { refreshToken: admin2.refreshToken }), 401, 'INVALID_REFRESH_TOKEN');
  const mariaSession = (await call('GET', '/auth/sessions', ch.body.accessToken)).body[0];
  check('Intenta cerrar una sesión de OTRA persona', await call('DELETE', `/auth/sessions/${mariaSession.id}`, A), 404, 'SESSION_NOT_FOUND');
  await pause();

  console.log('— Bloqueo por intentos fallidos (umbral 3 en esta prueba)');
  check('Intento fallido 1', await login('empleado@demo.local', 'mala'), 401, 'INVALID_CREDENTIALS');
  check('Intento fallido 2', await login('empleado@demo.local', 'mala'), 401, 'INVALID_CREDENTIALS');
  const locked = check('Intento fallido 3 → bloqueada', await login('empleado@demo.local', 'mala'), 403, 'ACCOUNT_LOCKED');
  console.log(`     "${locked.body.message}" (retryAfterSeconds=${locked.body.details?.retryAfterSeconds})`);
  check('Ni con la contraseña correcta', await login('empleado@demo.local'), 403, 'ACCOUNT_LOCKED');
  check('Correo inexistente: no se bloquea ni se revela nada', await login('noexiste@demo.local', 'mala'), 401, 'INVALID_CREDENTIALS');
  expect('Correo de aviso de bloqueo', (await lastMailTo('empleado@demo.local')).includes('Bloqueamos temporalmente tu cuenta'));
  await pause();

  console.log('— Recuperación por correo (desbloquea la cuenta)');
  const f1 = check('Solicitar con un correo que no existe', await call('POST', '/auth/password/forgot', null, { email: 'noexiste@demo.local' }), 202);
  const f2 = check('Solicitar con el correo de Carlos', await call('POST', '/auth/password/forgot', null, { email: 'EMPLEADO@demo.local' }), 202);
  expect('     ambas respuestas son idénticas', JSON.stringify(f1.body) === JSON.stringify(f2.body));
  const mail = await lastMailTo('empleado@demo.local');
  const token = tokenIn(mail);
  console.log(`     enlace recibido: ${mail.match(/https?:\/\/\S+|asistencia:\/\/\S+/)?.[0]?.slice(0, 60)}…`);
  const [stored] = await q(`SELECT "tokenHash" FROM password_reset_tokens ORDER BY "createdAt" DESC LIMIT 1`);
  expect('     en la base solo está el hash, no el token', stored.tokenHash !== token && stored.tokenHash.length === 64);
  check('Token con formato inválido', await call('POST', '/auth/password/reset', null, { token: 'abc', newPassword: 'Nueva2026x' }), 400, 'VALIDATION_ERROR');
  check('Token inventado', await call('POST', '/auth/password/reset', null, { token: 'A'.repeat(43), newPassword: 'Nueva2026x' }), 400, 'INVALID_RESET_TOKEN');
  check('Restablecer', await call('POST', '/auth/password/reset', null, { token, newPassword: 'Nueva2026x' }), 204);
  check('Usar el mismo enlace otra vez', await call('POST', '/auth/password/reset', null, { token, newPassword: 'Otra2026xx' }), 400, 'INVALID_RESET_TOKEN');
  const cl = check('Carlos entra con la nueva (la cuenta quedó desbloqueada)', await login('empleado@demo.local', 'Nueva2026x'), 200);
  await call('POST', '/auth/password/forgot', null, { email: 'empleado@demo.local' });
  const t2 = tokenIn(await lastMailTo('empleado@demo.local'));
  await q(`UPDATE password_reset_tokens SET "expiresAt"=now()-interval '1 minute' WHERE "usedAt" IS NULL`);
  check('Enlace vencido', await call('POST', '/auth/password/reset', null, { token: t2, newPassword: 'Nueva2026y' }), 400, 'INVALID_RESET_TOKEN');

  console.log('— El admin envía el enlace (no puede fijar la contraseña)');
  check('Admin de A envía enlace a María', await call('POST', `/users/${m1.body.user.id}/password-reset`, A), 202);
  expect('     María recibió el correo de recuperación', (await lastMailTo('maria@demo.local')).includes('Restablece tu contraseña'));
  const TB = (await login('admin@b.local')).body.accessToken;
  check('Admin de B intenta enviarlo a María (otra empresa)', await call('POST', `/users/${m1.body.user.id}/password-reset`, TB), 404, 'USER_NOT_FOUND');
  check('Empleado intenta enviarlo', await call('POST', `/users/${m1.body.user.id}/password-reset`, cl.body.accessToken), 403, 'FORBIDDEN');

  const actions = (await q(`SELECT DISTINCT action FROM audit_logs WHERE action LIKE 'user.password%' ORDER BY 1`)).map(r => r.action);
  expect(`Auditoría: ${actions.join(', ')}`, actions.length === 3);
  const leaks = (await q(`SELECT count(*)::int n FROM audit_logs WHERE after::text ~* '(Temporal2026|MiClave2026|Nueva2026|argon2)'`))[0].n;
  expect('Ninguna contraseña ni hash en la auditoría', leaks === 0);
  await db.end(); console.log(`\n${pass} OK, ${fail} fallos`);
})().catch(e => { console.error(e); process.exit(1); });
