// Prueba de punta a punta: attendance. Se ejecuta con test/e2e/run.mjs (ver README).
const { Client } = require('pg');
const { hash } = require('@node-rs/argon2');
const { randomUUID: key } = require('crypto');
const B = (process.env.E2E_BASE_URL ?? 'http://localhost:3999') + '/api/v1';
let pass = 0, fail = 0;
const call = async (m, p, t, b) => { const r = await fetch(B + p, { method: m, headers: { 'Content-Type': 'application/json', ...(t && { Authorization: 'Bearer ' + t }) }, body: b && JSON.stringify(b) }); const x = await r.text(); return { status: r.status, body: x ? JSON.parse(x) : null }; };
const check = (l, r, s, c) => { const got = r.body?.code ?? r.body?.rejection ?? (r.body?.accepted ? 'ACCEPTED' : undefined); const ok = r.status === s && (!c || got === c); ok ? pass++ : fail++; console.log(`${ok ? '✔' : '✘'} ${l.padEnd(62)} ${r.status} ${got ?? ''}${ok ? '' : ' ← esperado ' + s + ' ' + (c ?? '') + ' ' + JSON.stringify(r.body).slice(0, 300)}`); return r; };
const expect = (l, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? '✔' : '✘'} ${l}${extra ? '  ' + extra : ''}`); };
const login = async (e) => (await call('POST', '/auth/login', null, { email: e, password: 'Demo123!' })).body.accessToken;
const TZ = 'America/Bogota';
const local = (d) => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(d).map(x => [x.type, x.value])); return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` }; };
const STORE = { latitude: 4.6097, longitude: -74.0817 };
const at = (m, acc = 10, extra = {}) => ({ latitude: STORE.latitude + m / 111195, longitude: STORE.longitude, accuracyMeters: acc, idempotencyKey: key(), device: { platform: 'android', appVersion: '1.0.0' }, ...extra });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const db = new Client({ connectionString: process.env.E2E_DATABASE_URL }); await db.connect();
  const q = async (s, p) => (await db.query(s, p)).rows;
  const [compB] = await q(`INSERT INTO companies (id,name,slug,status,"updatedAt") VALUES (gen_random_uuid(),'Empresa B','empresa-b','ACTIVE',now()) RETURNING id`);
  const [admRole] = await q(`SELECT id FROM roles WHERE code='COMPANY_ADMIN' AND "companyId" IS NULL`);
  const [uB] = await q(`INSERT INTO users (id,email,"passwordHash","firstName","lastName","updatedAt") VALUES (gen_random_uuid(),'admin@b.local',$1,'Beto','B',now()) RETURNING id`, [await hash('Demo123!')]);
  await db.query(`INSERT INTO company_memberships (id,"companyId","userId","roleId","updatedAt") VALUES (gen_random_uuid(),$1,$2,$3,now())`, [compB.id, uB.id, admRole.id]);

  const A = await login('admin@demo.local'), TB = await login('admin@b.local'), C = await login('empleado@demo.local');
  const [store] = await q(`SELECT id FROM stores WHERE code='CENTRO'`);
  const [carlos] = await q(`SELECT id, "userId" FROM employees WHERE code='EMP-001'`);
  const ana = (await call('POST', '/employees', A, { code: 'E-ANA', documentType: 'CC', documentNumber: '111', firstName: 'Ana', lastName: 'Ruiz', email: 'ana@demo.local', hireDate: '2026-01-10' })).body.id;
  await call('POST', `/employees/${ana}/access`, A, { password: 'Demo123!' });
  await db.query(`UPDATE users SET "mustChangePassword"=false`); // ya cambiaron la temporal
  const N = await login('ana@demo.local');

  const soon = (min) => local(new Date(Date.now() + min * 60_000 + 60_000 - (Date.now() % 60_000)));
  const makeShift = async (who, startMin, hours = 8) => {
    const s = soon(startMin), e = local(new Date(Date.now() + (startMin + hours * 60) * 60_000 + 60_000 - (Date.now() % 60_000)));
    return (await call('POST', '/shifts', A, { storeId: store.id, date: s.date, startTime: s.time, endTime: e.time, breakMinutes: 60, earlyClockInMinutes: 5, lateToleranceMinutes: 5, employeeIds: [who] })).body;
  };

  console.log('— Estado inicial');
  let st = check('Carlos consulta su estado (sin turnos)', await call('GET', '/me/attendance/status', C), 200);
  expect('     sin jornada abierta ni próximo turno', !st.body.openAttendance && !st.body.nextShift);
  check('Admin (no es empleado) intenta marcar', await call('POST', '/me/attendance/clock-in', A, at(0)), 403, 'NOT_AN_EMPLOYEE');
  check('Salida sin haber entrado', await call('POST', '/me/attendance/clock-out', C, at(0)), 200, 'NOT_CLOCKED_IN');
  check('Entrada sin turno', await call('POST', '/me/attendance/clock-in', C, at(0)), 200, 'NO_SHIFT');

  console.log('— Entrada (turno que empieza en ~3 min, se puede marcar 5 min antes)');
  const s1 = await makeShift(carlos.id, 2);
  st = check('Estado: próximo turno con la ventana abierta', await call('GET', '/me/attendance/status', C), 200);
  expect(`     canClockIn=${st.body.nextShift?.canClockIn} | turno ${st.body.nextShift?.shift.localStart}–${st.body.nextShift?.shift.localEnd} en ${st.body.nextShift?.shift.storeName}`, st.body.nextShift?.canClockIn === true);
  check('A 500 m del local', await call('POST', '/me/attendance/clock-in', C, at(500)), 200, 'OUTSIDE_GEOFENCE');
  check('Con GPS falso (mocked)', await call('POST', '/me/attendance/clock-in', C, at(10, 10, { mocked: true })), 200, 'MOCK_LOCATION');
  check('Precisión de 80 m', await call('POST', '/me/attendance/clock-in', C, at(10, 80)), 200, 'LOW_GPS_ACCURACY');
  const okBody = at(15);
  const inRes = check('Dentro del local, buena precisión', await call('POST', '/me/attendance/clock-in', C, okBody), 200, 'ACCEPTED');
  console.log(`     distancia ${inRes.body.location.distanceMeters} m | tarde ${inRes.body.lateMinutes} min | hora oficial ${inRes.body.effectiveAt}`);
  const again = check('Reintento con la misma idempotencyKey', await call('POST', '/me/attendance/clock-in', C, okBody), 200, 'ACCEPTED');
  expect('     es el mismo evento (replayed), no uno nuevo', again.body.replayed && again.body.eventId === inRes.body.eventId);
  check('Misma clave usada para una salida', await call('POST', '/me/attendance/clock-out', C, okBody), 409, 'IDEMPOTENCY_KEY_REUSED');
  check('Segunda entrada (clave nueva)', await call('POST', '/me/attendance/clock-in', C, at(10)), 200, 'ALREADY_CLOCKED_IN');
  const early = (await call('GET', `/attendance/${inRes.body.attendanceId}`, A)).body;
  expect('Detalle incluye los 3 intentos rechazados previos a la entrada', ['OUTSIDE_GEOFENCE', 'MOCK_LOCATION', 'LOW_GPS_ACCURACY'].every(r => early.events.some(e => e.rejectionReason === r)), `→ ${early.events.map(e => e.result === 'ACCEPTED' ? e.type : e.rejectionReason).join(' → ')}`);
  st = (await call('GET', '/me/attendance/status', C)).body;
  expect('Estado: jornada abierta', !!st.openAttendance, `entrada ${st.openAttendance?.clockInAt}`);

  console.log('— Doble toque: 5 entradas simultáneas de Ana con claves distintas');
  await makeShift(ana, 2);
  const burst = await Promise.all(Array.from({ length: 5 }, () => call('POST', '/me/attendance/clock-in', N, at(5))));
  const acc = burst.filter(r => r.body.accepted).length, dup = burst.filter(r => r.body.rejection === 'ALREADY_CLOCKED_IN').length;
  expect(`${acc} aceptada, ${dup} ALREADY_CLOCKED_IN`, acc === 1 && dup === 4);
  const [anaRows] = await q(`SELECT count(*)::int n FROM attendances WHERE "employeeId"=$1`, [ana]);
  expect('     una sola asistencia en la base', anaRows.n === 1);

  console.log('— Salida con cálculo de minutos (el turno se mueve al pasado para simular la jornada)');
  // Turno que empezó hace 7h55m y terminó hace 5 min; Carlos entró 20 min tarde
  await q(`UPDATE shifts SET "startsAt"=now()-interval '475 minutes', "endsAt"=now()-interval '5 minutes' WHERE id=$1`, [s1.id]);
  await q(`UPDATE attendances SET "clockInAt"=now()-interval '455 minutes' WHERE "employeeId"=$1 AND status='IN_PROGRESS'`, [carlos.id]);
  check('Salida lejos del local', await call('POST', '/me/attendance/clock-out', C, at(400)), 200, 'OUTSIDE_GEOFENCE');
  const out = check('Salida dentro del local', await call('POST', '/me/attendance/clock-out', C, at(20)), 200, 'ACCEPTED');
  const m = out.body.metrics;
  console.log(`     tarde ${m.lateMinutes} | trabajado ${m.workedMinutes} (= 455 - 60 de descanso) | extra ${m.overtimeMinutes} | salida anticipada ${m.earlyLeaveMinutes}`);
  expect('     métricas correctas', m.lateMinutes === 20 && Math.abs(m.workedMinutes - 395) <= 1 && Math.abs(m.overtimeMinutes - 5) <= 1 && m.earlyLeaveMinutes === 0);
  check('Otra salida', await call('POST', '/me/attendance/clock-out', C, at(20)), 200, 'NOT_CLOCKED_IN');

  console.log('— Sin conexión: jornada de ayer, teléfono atrasado 10 minutos');
  const y = local(new Date(Date.now() - 24 * 3600_000)).date;
  const [yShift] = await q(`INSERT INTO shifts (id,"companyId","storeId","startsAt","endsAt","breakMinutes","earlyClockInMinutes","lateToleranceMinutes","updatedAt") SELECT gen_random_uuid(),"companyId",id,($1||' 14:00-05')::timestamptz,($1||' 22:00-05')::timestamptz,60,5,5,now() FROM stores WHERE id=$2 RETURNING id`, [y, store.id]);
  await q(`INSERT INTO shift_assignments (id,"companyId","shiftId","employeeId","updatedAt") SELECT gen_random_uuid(),"companyId",$1,$2,now() FROM shifts WHERE id=$1`, [yShift.id, carlos.id]);
  const lag = 10 * 60_000, now = Date.now();
  const phone = (hhmm) => new Date(new Date(`${y}T${hhmm}:00-05:00`).getTime() - lag).toISOString();
  const evIn = { ...at(12), type: 'CLOCK_IN', clientTimestamp: phone('13:58') };
  const evOut = { ...at(12), type: 'CLOCK_OUT', clientTimestamp: phone('22:02') };
  const evFuture = { ...at(12), type: 'CLOCK_IN', clientTimestamp: new Date(now + 3600_000 - lag).toISOString() };
  const syncBody = { deviceNow: new Date(now - lag).toISOString(), events: [evOut, evIn, evFuture] };
  const sync = check('Sincronizar 3 eventos (salida enviada ANTES que la entrada)', await call('POST', '/me/attendance/sync', C, syncBody), 200);
  const [rOut, rIn, rFut] = sync.body.results;
  console.log(`     entrada: ${rIn.accepted ? 'aceptada' : rIn.rejection} a las ${local(new Date(rIn.effectiveAt)).time} (teléfono decía ${local(new Date(evIn.clientTimestamp)).time})`);
  console.log(`     salida:  ${rOut.accepted ? 'aceptada' : rOut.rejection} a las ${local(new Date(rOut.effectiveAt)).time} | trabajado ${rOut.metrics?.workedMinutes} min, extra ${rOut.metrics?.overtimeMinutes}`);
  expect('     entrada y salida aceptadas con la hora corregida', rIn.accepted && rOut.accepted && local(new Date(rIn.effectiveAt)).time === '13:58' && local(new Date(rOut.effectiveAt)).time === '22:02');
  expect('     marcación "en el futuro" rechazada', rFut.rejection === 'FUTURE_TIMESTAMP');
  expect('     jornada marcada para revisión', rOut.needsReview === true);
  const resync = check('Reenviar la misma sincronización', await call('POST', '/me/attendance/sync', C, syncBody), 200);
  expect('     todo se reconoce como reintento, sin duplicar', resync.body.results.every(r => r.replayed));
  const [yAtt] = await q(`SELECT status, "reviewReasons", "workedMinutes" FROM attendances WHERE "shiftAssignmentId"=(SELECT id FROM shift_assignments WHERE "shiftId"=$1)`, [yShift.id]);
  console.log(`     en la base: ${yAtt.status}, revisión por ${JSON.stringify(yAtt.reviewReasons)}`);

  console.log('— Cierre automático de jornadas (job cada 2 s en esta prueba)');
  await q(`UPDATE shifts SET "startsAt"=now()-interval '13 hours', "endsAt"=now()-interval '5 hours' WHERE id IN (SELECT "shiftId" FROM shift_assignments WHERE "employeeId"=$1)`, [ana]);
  const [past] = await q(`INSERT INTO shifts (id,"companyId","storeId","startsAt","endsAt","updatedAt") SELECT gen_random_uuid(),"companyId",id,now()-interval '10 hours',now()-interval '2 hours',now() FROM stores WHERE id=$1 RETURNING id`, [store.id]);
  await q(`INSERT INTO shift_assignments (id,"companyId","shiftId","employeeId","updatedAt") SELECT gen_random_uuid(),"companyId",$1,$2,now() FROM shifts WHERE id=$1`, [past.id, ana]);
  await sleep(4500);
  const closed = await q(`SELECT status, "reviewReasons" FROM attendances WHERE "employeeId"=$1 ORDER BY status`, [ana]);
  console.log('     Ana:', closed.map(c => `${c.status} ${JSON.stringify(c.reviewReasons)}`).join(' | '));
  expect('     jornada sin salida → INCOMPLETE; turno sin entrada → ABSENT', closed.some(c => c.status === 'INCOMPLETE') && closed.some(c => c.status === 'ABSENT'));
  const [n] = await q(`SELECT title, body FROM notifications WHERE type='MISSING_CLOCK_OUT'`);
  console.log(`     🔔 ${n?.title}: ${n?.body}`);

  console.log('— Bandeja del supervisor');
  const from = local(new Date(Date.now() - 3 * 86400_000)).date, to = local(new Date(Date.now() + 86400_000)).date;
  const inbox = check('Pendientes de revisión', await call('GET', `/attendance?from=${from}&to=${to}&needsReview=true`, A), 200);
  console.log('    ', inbox.body.items.map(i => `${i.employee.firstName}: ${i.status} ${JSON.stringify(i.reviewReasons)}`).join(' | '));
  const carlosToday = (await call('GET', `/attendance?from=${from}&to=${to}&employeeId=${carlos.id}&status=COMPLETED`, A)).body.items.find(i => !i.needsReview);
  const det = check('Detalle con todos los intentos', await call('GET', `/attendance/${carlosToday.id}`, A), 200);
  console.log('     eventos:', det.body.events.map(e => e.result === 'ACCEPTED' ? e.type : e.rejectionReason).join(' → '));
  const inc = inbox.body.items.find(i => i.status === 'INCOMPLETE');
  check('Ajuste con salida anterior a la entrada', await call('POST', `/attendance/${inc.id}/adjust`, A, { clockOutAt: new Date(new Date(inc.clockInAt).getTime() - 60_000).toISOString(), reason: 'Prueba inválida' }), 400, 'INVALID_ADJUSTMENT');
  check('Ajuste con hora en el futuro', await call('POST', `/attendance/${inc.id}/adjust`, A, { clockOutAt: new Date(Date.now() + 3600_000).toISOString(), reason: 'Prueba inválida' }), 400, 'INVALID_ADJUSTMENT');
  check('Ajuste sin motivo', await call('POST', `/attendance/${inc.id}/adjust`, A, { clockOutAt: inc.shift.endsAt }), 400, 'VALIDATION_ERROR');
  const adj = check('Registrar la salida olvidada', await call('POST', `/attendance/${inc.id}/adjust`, A, { clockInAt: inc.shift.startsAt, clockOutAt: inc.shift.endsAt, reason: 'Olvidó marcar; confirmado con el supervisor' }), 200);
  console.log(`     ahora: ${adj.body.status}, ${adj.body.workedMinutes} min, needsReview=${adj.body.needsReview} | último evento: ${adj.body.events.at(-1).type} "${adj.body.events.at(-1).deviceInfo.reason}"`);
  const off = inbox.body.items.find(i => i.reviewReasons.includes('DEVICE_CLOCK_DRIFT'));
  check('Aprobar la jornada offline sin cambios', await call('POST', `/attendance/${off.id}/review`, A, { notes: 'Verificado' }), 200);

  console.log('— Aislamiento y permisos');
  check('Empresa B consulta una asistencia de A', await call('GET', `/attendance/${off.id}`, TB), 404, 'ATTENDANCE_NOT_FOUND');
  check('Empresa B ajusta una asistencia de A', await call('POST', `/attendance/${off.id}/adjust`, TB, { clockInAt: null, reason: 'Ataque cross-tenant' }), 404, 'ATTENDANCE_NOT_FOUND');
  expect('Bandeja de B vacía', (await call('GET', `/attendance?from=${from}&to=${to}`, TB)).body.total === 0);
  check('Empleado intenta ver la asistencia de todos', await call('GET', `/attendance?from=${from}&to=${to}`, C), 403, 'FORBIDDEN');
  check('Empleado intenta ajustar su propia asistencia', await call('POST', `/attendance/${off.id}/adjust`, C, { clockInAt: null, reason: 'Autoajuste' }), 403, 'FORBIDDEN');
  const hist = check('Carlos consulta su historial', await call('GET', `/me/attendance?from=${from}&to=${to}`, C), 200);
  console.log(`     ${hist.body.total} jornadas: ${hist.body.items.map(i => `${i.workDate} ${i.status} ${i.workedMinutes}min`).join(' | ')}`);
  const [ev] = await q(`SELECT count(*)::int n, count(*) FILTER (WHERE result='REJECTED')::int r FROM attendance_events`);
  console.log(`\nEventos guardados: ${ev.n} (${ev.r} intentos rechazados conservados como evidencia)`);
  await db.end(); console.log(`\n${pass} OK, ${fail} fallos`);
})().catch(e => { console.error(e); process.exit(1); });
