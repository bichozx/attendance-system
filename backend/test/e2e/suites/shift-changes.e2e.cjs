// Prueba de punta a punta: shift-changes. Se ejecuta con test/e2e/run.mjs (ver README).
const { Client } = require('pg');
const { hash } = require('@node-rs/argon2');
const B = (process.env.E2E_BASE_URL ?? 'http://localhost:3999') + '/api/v1';
let pass = 0, fail = 0;
// El ejecutor sube el límite de logins para las pruebas; sin él, hay que esperar el minuto
const RATE_PAUSE = Number(process.env.E2E_RATE_PAUSE_MS ?? 61_000);
const call = async (m, p, t, b) => { const r = await fetch(B + p, { method: m, headers: { 'Content-Type': 'application/json', ...(t && { Authorization: 'Bearer ' + t }) }, body: b && JSON.stringify(b) }); const x = await r.text(); return { status: r.status, body: x ? JSON.parse(x) : null }; };
const check = (l, r, s, c) => { const got = r.body?.code ?? r.body?.stage; const ok = r.status === s && (!c || got === c); ok ? pass++ : fail++; console.log(`${ok ? '✔' : '✘'} ${l.padEnd(68)} ${r.status} ${got ?? ''}${ok ? '' : ' ← esperado ' + s + ' ' + (c ?? '') + ' ' + JSON.stringify(r.body).slice(0, 250)}`); return r; };
const expect = (l, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? '✔' : '✘'} ${l}${extra ? '  ' + extra : ''}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const login = async (email) => (await call('POST', '/auth/login', null, { email, password: 'Demo123!' })).body.accessToken;
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
const day = (n) => { const d = new Date(today + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const local = (ms) => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(ms)).map(x => [x.type, x.value])); return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` }; };

(async () => {
  const db = new Client({ connectionString: process.env.E2E_DATABASE_URL }); await db.connect();
  const q = async (s, p) => (await db.query(s, p)).rows;
  const [compB] = await q(`INSERT INTO companies (id,name,slug,status,"updatedAt") VALUES (gen_random_uuid(),'Empresa B','empresa-b','ACTIVE',now()) RETURNING id`);
  const [admRole] = await q(`SELECT id FROM roles WHERE code='COMPANY_ADMIN' AND "companyId" IS NULL`);
  const [uB] = await q(`INSERT INTO users (id,email,"passwordHash","firstName","lastName","updatedAt") VALUES (gen_random_uuid(),'admin@b.local',$1,'Beto','B',now()) RETURNING id`, [await hash('Demo123!')]);
  await db.query(`INSERT INTO company_memberships (id,"companyId","userId","roleId","updatedAt") VALUES (gen_random_uuid(),$1,$2,$3,now())`, [compB.id, uB.id, admRole.id]);

  const A = await login('admin@demo.local');
  const [store] = await q(`SELECT id FROM stores WHERE code='CENTRO'`);
  const [carlos] = await q(`SELECT id FROM employees WHERE code='EMP-001'`);
  const emp = async (code, doc, name, email) => {
    const e = (await call('POST', '/employees', A, { code, documentType: 'CC', documentNumber: doc, firstName: name, lastName: 'Test', email, hireDate: '2026-01-10' })).body;
    if (email) await call('POST', `/employees/${e.id}/access`, A, { password: 'Demo123!' });
    return e.id;
  };
  const ana = await emp('E-ANA', '111', 'Ana', 'ana@demo.local');
  const luis = await emp('E-LUIS', '222', 'Luis', 'luis@demo.local');
  const pedro = await emp('E-PEDRO', '333', 'Pedro');
  const sofia = await emp('E-SOFIA', '444', 'Sofía', 'sofia@demo.local');
  const adminEmp = await emp('E-ADMIN', '555', 'Admin', 'admin@demo.local');
  await db.query(`UPDATE users SET "mustChangePassword"=false`);
  const sup = (await call('GET', '/roles', A)).body.find(r => r.code === 'SUPERVISOR');
  await call('POST', '/users', A, { email: 'laura@demo.local', firstName: 'Laura', lastName: 'Sup', password: 'Demo123!', roleId: sup.id });
  await db.query(`UPDATE users SET "mustChangePassword"=false`);
  await call('POST', '/incidents', A, { employeeId: sofia, type: 'SICK_LEAVE', startDate: day(2), endDate: day(2), description: 'Incapacidad' });
  const C = await login('empleado@demo.local'), N = await login('ana@demo.local'), L = await login('luis@demo.local');

  const shift = async (d, s, e, who) => (await call('POST', '/shifts', A, { storeId: store.id, date: d, startTime: s, endTime: e, employeeIds: [who] })).body.id;
  const S1 = await shift(day(2), '14:00', '22:00', carlos.id);
  await shift(day(2), '15:00', '20:00', luis);           // Luis ocupado ese día
  const S2 = await shift(day(3), '08:00', '16:00', ana);
  const S5 = await shift(day(5), '06:00', '14:00', luis);
  const soon = local(Date.now() + 30 * 60_000), soonEnd = local(Date.now() + 5 * 3600_000);
  const S6 = await shift(soon.date, soon.time, soonEnd.time, carlos.id);
  console.log(`Turno de Carlos a ceder: ${day(2)} 14:00–22:00\n`);

  console.log('— Opciones (ya filtradas)');
  const opt = check('Carlos consulta con quién puede cambiar su turno', await call('GET', `/me/shift-changes/options?shiftId=${S1}`, C), 200);
  const names = opt.body.cover.map(c => c.firstName);
  console.log(`     pueden cubrir: ${names.join(', ')}`);
  expect('     Ana sí · Luis no (cruce) · Pedro no (sin app) · Sofía no (incapacidad)', names.includes('Ana') && !names.includes('Luis') && !names.includes('Pedro') && !names.includes('Sofía'));
  console.log(`     intercambiables: ${opt.body.swap.map(o => `${o.coworker.firstName} ${o.shift.description}`).join(' | ')}`);
  expect('     el turno de Ana sí; el de Luis no (Luis no puede tomar el de Carlos)', opt.body.swap.some(o => o.shift.shiftId === S2) && !opt.body.swap.some(o => o.shift.shiftId === S5));
  expect('     solo nombres y horarios (sin documento, correo ni teléfono)', Object.keys(opt.body.cover[0]).sort().join() === 'employeeId,firstName,lastName');

  console.log('— Solicitud y validaciones');
  check('Pedir a Luis que cubra (tiene cruce ese día)', await call('POST', '/me/shift-changes', C, { kind: 'COVER', shiftId: S1, peerEmployeeId: luis }), 409, 'SCHEDULE_CONFLICT');
  check('Pedir a Pedro (sin acceso a la app)', await call('POST', '/me/shift-changes', C, { kind: 'COVER', shiftId: S1, peerEmployeeId: pedro }), 409, 'EMPLOYEES_NOT_AVAILABLE');
  check('Pedir cambio de un turno que empieza en 30 min', await call('POST', '/me/shift-changes', C, { kind: 'COVER', shiftId: S6, peerEmployeeId: ana }), 409, 'SHIFT_CHANGE_TOO_LATE');
  check('Ceder un turno ajeno (el de Ana)', await call('POST', '/me/shift-changes', C, { kind: 'COVER', shiftId: S2, peerEmployeeId: luis }), 400, 'INVALID_SHIFT_CHANGE');
  const r1 = check('Pedir a Ana que cubra', await call('POST', '/me/shift-changes', C, { kind: 'COVER', shiftId: S1, peerEmployeeId: ana, reason: 'Cita médica' }), 201, 'AWAITING_PEER').body;
  check('Pedirlo otra vez', await call('POST', '/me/shift-changes', C, { kind: 'COVER', shiftId: S1, peerEmployeeId: ana }), 409, 'SHIFT_CHANGE_ALREADY_PENDING');
  check('El supervisor intenta aprobar antes que Ana responda', await call('POST', `/shift-changes/${r1.id}/approve`, A, {}), 409, 'SHIFT_CHANGE_STATE');
  check('Luis intenta responder (no es a él)', await call('POST', `/me/shift-changes/${r1.id}/respond`, L, { accept: true }), 404, 'SHIFT_CHANGE_NOT_FOUND');
  check('Ana acepta', await call('POST', `/me/shift-changes/${r1.id}/respond`, N, { accept: true }), 200, 'AWAITING_APPROVAL');
  const inbox = check('Bandeja del supervisor', await call('GET', '/shift-changes?stage=AWAITING_APPROVAL', A), 200);
  console.log(`     ${inbox.body.total} por aprobar`);
  check('Aprobar', await call('POST', `/shift-changes/${r1.id}/approve`, A, { notes: 'OK' }), 200, 'APPROVED');
  const [who] = await q(`SELECT string_agg(e."firstName" || ':' || a.status, ', ' ORDER BY e."firstName") s FROM shift_assignments a JOIN employees e ON e.id=a."employeeId" WHERE a."shiftId"=$1`, [S1]);
  expect(`     el turno ahora es de Ana (${who.s})`, who.s === 'Ana:ASSIGNED, Carlos:CANCELLED');
  const notes = await q(`SELECT u."firstName", n.title FROM notifications n JOIN users u ON u.id=n."userId" WHERE n.data->>'shiftChangeId'=$1 ORDER BY n."createdAt"`, [r1.id]);
  notes.forEach(n => console.log(`     🔔 ${n.firstName}: ${n.title}`));

  console.log('— Intercambio que se vuelve inválido antes de aprobarse');
  const r2 = check('Ana propone a Luis: su turno del día+3 por el de Luis del día+5', await call('POST', '/me/shift-changes', N, { kind: 'SWAP', shiftId: S2, peerEmployeeId: luis, peerShiftId: S5 }), 201, 'AWAITING_PEER').body;
  check('Luis acepta', await call('POST', `/me/shift-changes/${r2.id}/respond`, L, { accept: true }), 200, 'AWAITING_APPROVAL');
  const blocker = await shift(day(3), '07:00', '12:00', luis);
  console.log(`     (mientras tanto, el admin le asigna a Luis otro turno el día+3 07:00–12:00)`);
  check('Aprobar: ahora Luis tendría un cruce', await call('POST', `/shift-changes/${r2.id}/approve`, A, {}), 409, 'SCHEDULE_CONFLICT');
  const [st2] = await q(`SELECT (SELECT string_agg(e."firstName",',') FROM shift_assignments a JOIN employees e ON e.id=a."employeeId" WHERE a."shiftId"=$1 AND a.status='ASSIGNED') s2, (SELECT string_agg(e."firstName",',') FROM shift_assignments a JOIN employees e ON e.id=a."employeeId" WHERE a."shiftId"=$2 AND a.status='ASSIGNED') s5`, [S2, S5]);
  expect(`     nada se movió (día+3: ${st2.s2}, día+5: ${st2.s5})`, st2.s2 === 'Ana' && st2.s5 === 'Luis');
  check('     la solicitud sigue esperando aprobación', await call('GET', `/shift-changes/${r2.id}`, A), 200, 'AWAITING_APPROVAL');
  await call('POST', `/shifts/${blocker}/cancel`, A, { reason: 'Se resolvió el cruce' });
  check('El supervisor resuelve el cruce y aprueba', await call('POST', `/shift-changes/${r2.id}/approve`, A, {}), 200, 'APPROVED');
  const [st3] = await q(`SELECT (SELECT string_agg(e."firstName",',') FROM shift_assignments a JOIN employees e ON e.id=a."employeeId" WHERE a."shiftId"=$1 AND a.status='ASSIGNED') s2, (SELECT string_agg(e."firstName",',') FROM shift_assignments a JOIN employees e ON e.id=a."employeeId" WHERE a."shiftId"=$2 AND a.status='ASSIGNED') s5`, [S2, S5]);
  expect(`     intercambio hecho (día+3: ${st3.s2}, día+5: ${st3.s5})`, st3.s2 === 'Luis' && st3.s5 === 'Ana');
  await sleep(RATE_PAUSE); console.log('   (pausa por el límite de logins)');

  console.log('— Solicitud que queda vencida, rechazo del compañero, retiro y rechazo del supervisor');
  const S7 = await shift(day(6), '14:00', '22:00', carlos.id);
  const r3 = (await call('POST', '/me/shift-changes', C, { kind: 'COVER', shiftId: S7, peerEmployeeId: luis })).body;
  await call('POST', `/me/shift-changes/${r3.id}/respond`, L, { accept: true });
  await call('DELETE', `/shifts/${S7}/assignments/${carlos.id}`, A);
  console.log('     (el admin retiró a Carlos de ese turno por su cuenta)');
  check('Aprobar una solicitud cuyos turnos ya cambiaron', await call('POST', `/shift-changes/${r3.id}/approve`, A, {}), 409, 'SHIFT_CHANGE_STALE');
  check('     quedó cancelada', await call('GET', `/shift-changes/${r3.id}`, A), 200, 'CANCELLED');
  const S8 = await shift(day(7), '14:00', '22:00', carlos.id);
  const r4 = (await call('POST', '/me/shift-changes', C, { kind: 'COVER', shiftId: S8, peerEmployeeId: ana })).body;
  check('Ana no acepta', await call('POST', `/me/shift-changes/${r4.id}/respond`, N, { accept: false, notes: 'Ese día viajo' }), 200, 'DECLINED_BY_PEER');
  const r5 = (await call('POST', '/me/shift-changes', C, { kind: 'COVER', shiftId: S8, peerEmployeeId: luis })).body;
  check('Carlos retira su solicitud', await call('POST', `/me/shift-changes/${r5.id}/cancel`, C), 200, 'CANCELLED');
  const r6 = (await call('POST', '/me/shift-changes', C, { kind: 'COVER', shiftId: S8, peerEmployeeId: luis })).body;
  check('Rechazo del supervisor sin motivo', await call('POST', `/shift-changes/${r6.id}/reject`, A, {}), 400, 'VALIDATION_ERROR');
  check('Rechazo con motivo', await call('POST', `/shift-changes/${r6.id}/reject`, A, { notes: 'Necesitamos a Carlos en caja' }), 200, 'REJECTED');

  console.log('— Autoaprobación, concurrencia, permisos y aislamiento');
  const Lau = await login('laura@demo.local'), TB = await login('admin@b.local');
  const S9 = await shift(day(8), '14:00', '22:00', adminEmp);
  const r7 = (await call('POST', '/me/shift-changes', A, { kind: 'COVER', shiftId: S9, peerEmployeeId: ana })).body;
  await call('POST', `/me/shift-changes/${r7.id}/respond`, N, { accept: true });
  check('El admin intenta aprobar su propio cambio', await call('POST', `/shift-changes/${r7.id}/approve`, A, {}), 403, 'SELF_APPROVAL_FORBIDDEN');
  check('La supervisora lo aprueba', await call('POST', `/shift-changes/${r7.id}/approve`, Lau, {}), 200, 'APPROVED');
  const S10 = await shift(day(9), '14:00', '22:00', carlos.id);
  const r8 = (await call('POST', '/me/shift-changes', C, { kind: 'COVER', shiftId: S10, peerEmployeeId: ana })).body;
  await call('POST', `/me/shift-changes/${r8.id}/respond`, N, { accept: true });
  const race = await Promise.all([call('POST', `/shift-changes/${r8.id}/approve`, A, {}), call('POST', `/shift-changes/${r8.id}/approve`, Lau, {})]);
  expect(`Dos supervisores aprueban a la vez → ${race.map(r => r.status).sort().join(' y ')}`, race.map(r => r.status).sort().join() === '200,409');
  const [{ n: assigned }] = await q(`SELECT count(*)::int n FROM shift_assignments WHERE "shiftId"=$1 AND "employeeId"=$2 AND status='ASSIGNED'`, [S10, ana]);
  expect('     Ana quedó asignada una sola vez', assigned === 1);
  check('Empleado entra a la bandeja del supervisor', await call('GET', '/shift-changes', C), 403, 'FORBIDDEN');
  check('Empresa B consulta una solicitud de A', await call('GET', `/shift-changes/${r1.id}`, TB), 404, 'SHIFT_CHANGE_NOT_FOUND');
  const mine = check('Carlos ve sus solicitudes (pedidas y recibidas)', await call('GET', '/me/shift-changes?pageSize=50', C), 200);
  console.log(`     ${mine.body.items.map(i => i.stage).join(', ')}`);
  const all = (await call('GET', '/shift-changes?pageSize=100', A)).body.total;
  expect(`La bandeja muestra exactamente las 8 solicitudes creadas (${all})`, all === 8);
  await db.end(); console.log(`\n${pass} OK, ${fail} fallos`);
})().catch(e => { console.error(e); process.exit(1); });
