// Prueba de punta a punta: invitations. Se ejecuta con test/e2e/run.mjs (ver README).
// Dar acceso sin contraseña envía una invitación; con contraseña, queda como clave temporal.
const { Client } = require('pg');
const fs = require('fs');
const B = (process.env.E2E_BASE_URL ?? 'http://localhost:3999') + '/api/v1';
let pass = 0, fail = 0;
const call = async (m, p, t, b) => { const r = await fetch(B + p, { method: m, headers: { 'Content-Type': 'application/json', ...(t && { Authorization: 'Bearer ' + t }) }, body: b && JSON.stringify(b) }); const x = await r.text(); return { status: r.status, body: x ? JSON.parse(x) : null }; };
const check = (l, r, s, c) => { const ok = r.status === s && (!c || r.body?.code === c); ok ? pass++ : fail++; console.log(`${ok ? '✔' : '✘'} ${l.padEnd(64)} ${r.status} ${r.body?.code ?? ''}${ok ? '' : ' ← esperado ' + s + ' ' + (c ?? '') + ' ' + JSON.stringify(r.body).slice(0, 300)}`); return r; };
const expect = (l, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? '✔' : '✘'} ${l}${extra ? '  ' + extra : ''}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const login = (email, password = 'Demo123!') => call('POST', '/auth/login', null, { email, password });
const mails = () => fs.readFileSync(process.env.E2E_APP_LOG, 'utf8').split('──────── CORREO').slice(1);
const mailsTo = async (to) => { await sleep(400); return mails().filter(m => m.includes(`Para: ${to}`)); };
const tokenIn = (mail) => mail.match(/token=([A-Za-z0-9_-]{43})/)?.[1];

(async () => {
  const db = new Client({ connectionString: process.env.E2E_DATABASE_URL }); await db.connect();
  const q = async (s, p) => (await db.query(s, p)).rows;
  const A = (await login('admin@demo.local')).body.accessToken;
  const sup = (await call('GET', '/roles', A)).body.find(r => r.code === 'SUPERVISOR');

  console.log('— Usuario invitado (sin contraseña)');
  const created = check('Crear usuario sin contraseña', await call('POST', '/users', A, { email: 'Paula@Demo.local', firstName: 'Paula', lastName: 'Ríos', roleId: sup.id }), 201);
  expect('Responde invited=true y existingAccount=false', created.body.invited === true && created.body.existingAccount === false);
  expect('Queda con la invitación pendiente', created.body.user.invitationPending === true);
  const [first] = await mailsTo('paula@demo.local');
  expect('Le llega el correo de invitación con enlace', !!first && !!tokenIn(first) && /activarla/i.test(first));
  check('No puede entrar con ninguna contraseña antes de crearla', await login('paula@demo.local', 'Cualquiera123'), 401);

  // Reenviar: el mismo botón del panel reenvía la invitación (no un enlace de recuperación)
  const resend = check('Reenviar enlace a quien no ha creado su contraseña', await call('POST', `/users/${created.body.user.id}/password-reset`, A), 202);
  expect('Se reenvió la invitación', resend.body.kind === 'invitation');
  const invites = await mailsTo('paula@demo.local');
  expect(`Llegaron ${invites.length} invitaciones`, invites.length === 2 && /activarla/i.test(invites[1]));

  check('Crear contraseña con el enlace', await call('POST', '/auth/password/reset', null, { token: tokenIn(invites[1]), newPassword: 'MiClave2026' }), 204);
  const paula = check('Entra con su contraseña', await login('paula@demo.local', 'MiClave2026'), 200);
  expect('No se le pide cambiarla (la eligió ella)', paula.body.user.mustChangePassword === false);
  const after = (await call('GET', `/users/${created.body.user.id}`, A)).body;
  expect('Ya no figura con invitación pendiente', after.invitationPending === false);
  const reset = check('Ahora el enlace es de recuperación', await call('POST', `/users/${created.body.user.id}/password-reset`, A), 202);
  expect('…kind=reset', reset.body.kind === 'reset');

  console.log('— Usuario con clave temporal (sigue funcionando)');
  const temp = check('Crear usuario con contraseña', await call('POST', '/users', A, { email: 'tomas@demo.local', firstName: 'Tomás', lastName: 'Vega', roleId: sup.id, password: 'Temporal2026' }), 201);
  expect('invited=false, sin invitación pendiente', temp.body.invited === false && temp.body.user.invitationPending === false);
  const tl = check('Entra con la clave temporal', await login('tomas@demo.local', 'Temporal2026'), 200);
  expect('…y debe cambiarla', tl.body.user.mustChangePassword === true);
  expect('No se le envió invitación', (await mailsTo('tomas@demo.local')).every(m => !/activarla/i.test(m)));
  check('Contraseña débil sigue rechazada', await call('POST', '/users', A, { email: 'debil@demo.local', firstName: 'D', lastName: 'B', roleId: sup.id, password: 'abc' }), 400, 'VALIDATION_ERROR');

  console.log('— Acceso a la app desde la ficha del empleado');
  const emp = (await call('POST', '/employees', A, { code: 'E-INV', documentType: 'CC', documentNumber: '9001', firstName: 'Iván', lastName: 'Niño', email: 'ivan@demo.local', hireDate: '2026-01-10' })).body;
  const access = check('Dar acceso sin contraseña', await call('POST', `/employees/${emp.id}/access`, A, {}), 201);
  expect('invited=true y el empleado queda con acceso', access.body.invited === true && access.body.employee.hasAppAccess === true);
  expect('Le llega la invitación', (await mailsTo('ivan@demo.local')).some(m => /activarla/i.test(m) && tokenIn(m)));
  const [row] = await q(`SELECT "mustChangePassword" FROM users WHERE email='ivan@demo.local'`);
  expect('Sin clave temporal que cambiar', row.mustChangePassword === false);

  const emp2 = (await call('POST', '/employees', A, { code: 'E-TMP', documentType: 'CC', documentNumber: '9002', firstName: 'Sara', lastName: 'Paz', email: 'sara@demo.local', hireDate: '2026-01-10' })).body;
  const access2 = check('Dar acceso con clave temporal', await call('POST', `/employees/${emp2.id}/access`, A, { password: 'Temporal2026' }), 201);
  expect('invited=false', access2.body.invited === false);

  console.log('— Cuenta existente');
  const emp3 = (await call('POST', '/employees', A, { code: 'E-EXI', documentType: 'CC', documentNumber: '9003', firstName: 'Paula', lastName: 'Ríos', email: 'paula@demo.local', hireDate: '2026-01-10' })).body;
  const access3 = check('Vincular a quien ya tiene cuenta', await call('POST', `/employees/${emp3.id}/access`, A, {}), 201);
  expect('existingAccount=true, sin invitación', access3.body.existingAccount === true && access3.body.invited === false);
  check('Sigue entrando con su contraseña', await login('paula@demo.local', 'MiClave2026'), 200);

  const actions = (await q(`SELECT action, count(*)::int n FROM audit_logs WHERE action IN ('user.invited','user.invitation_resent') GROUP BY 1 ORDER BY 1`));
  expect(`Auditoría: ${actions.map(a => `${a.action}×${a.n}`).join(', ')}`, actions.length === 2);
  const leaks = (await q(`SELECT count(*)::int n FROM audit_logs WHERE after::text ~* '(Temporal2026|MiClave2026|invitation-pending|argon2)'`))[0].n;
  expect('Ni contraseñas ni marcas internas en la auditoría', leaks === 0);
  await db.end(); console.log(`\n${pass} OK, ${fail} fallos`);
})().catch(e => { console.error(e); process.exit(1); });
