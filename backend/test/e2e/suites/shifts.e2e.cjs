// Prueba de punta a punta: shifts. Se ejecuta con test/e2e/run.mjs (ver README).
const { Client } = require('pg');
const { hash } = require('@node-rs/argon2');
const B = (process.env.E2E_BASE_URL ?? 'http://localhost:3999') + '/api/v1';
let pass = 0, fail = 0;
const call = async (m, p, t, b) => { const r = await fetch(B + p, { method: m, headers: { 'Content-Type': 'application/json', ...(t && { Authorization: 'Bearer ' + t }) }, body: b && JSON.stringify(b) }); const x = await r.text(); return { status: r.status, body: x ? JSON.parse(x) : null }; };
const check = (l, r, s, c) => { const ok = r.status === s && (!c || r.body?.code === c); ok ? pass++ : fail++; console.log(`${ok ? '✔' : '✘'} ${l.padEnd(64)} ${r.status}${r.body?.code ? ' ' + r.body.code : ''}${ok ? '' : ' ← esperado ' + s + ' ' + (c ?? '') + ' ' + JSON.stringify(r.body).slice(0, 260)}`); return r; };
const expect = (l, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? '✔' : '✘'} ${l}${extra ? '  ' + extra : ''}`); };
const login = async (e) => (await call('POST', '/auth/login', null, { email: e, password: 'Demo123!' })).body.accessToken;
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
const day = (n) => { const d = new Date(today + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

(async () => {
  const db = new Client({ connectionString: process.env.E2E_DATABASE_URL }); await db.connect();
  const q = async (s, p) => (await db.query(s, p)).rows;
  const [compB] = await q(`INSERT INTO companies (id,name,slug,status,"updatedAt") VALUES (gen_random_uuid(),'Empresa B','empresa-b','ACTIVE',now()) RETURNING id`);
  const [admRole] = await q(`SELECT id FROM roles WHERE code='COMPANY_ADMIN' AND "companyId" IS NULL`);
  const [uB] = await q(`INSERT INTO users (id,email,"passwordHash","firstName","lastName","updatedAt") VALUES (gen_random_uuid(),'admin@b.local',$1,'Beto','B',now()) RETURNING id`, [await hash('Demo123!')]);
  await db.query(`INSERT INTO company_memberships (id,"companyId","userId","roleId","updatedAt") VALUES (gen_random_uuid(),$1,$2,$3,now())`, [compB.id, uB.id, admRole.id]);
  const [empB] = await q(`INSERT INTO employees (id,"companyId",code,"documentType","documentNumber","firstName","lastName","hireDate","updatedAt") VALUES (gen_random_uuid(),$1,'B1','CC','9','Bruno','B','2026-01-01',now()) RETURNING id`, [compB.id]);

  const A = await login('admin@demo.local'), TB = await login('admin@b.local'), E = await login('empleado@demo.local');
  const [store] = await q(`SELECT id FROM stores WHERE code='CENTRO'`);
  const [carlos] = await q(`SELECT id, "userId" FROM employees WHERE code='EMP-001'`);
  const mk = async (code, doc, name) => (await call('POST', '/employees', A, { code, documentType: 'CC', documentNumber: doc, firstName: name, lastName: 'Test', hireDate: '2026-01-10' })).body.id;
  const ana = await mk('E-ANA', '111', 'Ana'), luis = await mk('E-LUIS', '222', 'Luis'), sofi = await mk('E-SOFI', '333', 'Sofía');
  console.log(`Hoy (Bogotá): ${today}. Programación del ${day(2)} al ${day(16)}\n`);

  console.log('— Periodos');
  const per = check('Crear quincena (borrador)', await call('POST', '/schedule-periods', A, { storeId: store.id, startDate: day(2), endDate: day(16) }), 201);
  console.log(`     nombre generado: "${per.body.name}" | estado ${per.body.status}`);
  const P = per.body.id;
  check('Periodo que se cruza, misma tienda', await call('POST', '/schedule-periods', A, { storeId: store.id, startDate: day(10), endDate: day(20) }), 409, 'SCHEDULE_PERIOD_OVERLAP');
  check('Periodo de toda la empresa que se cruza', await call('POST', '/schedule-periods', A, { startDate: day(15), endDate: day(20) }), 409, 'SCHEDULE_PERIOD_OVERLAP');
  check('Periodo de 40 días', await call('POST', '/schedule-periods', A, { storeId: store.id, startDate: day(30), endDate: day(69) }), 400, 'INVALID_PERIOD_DATES');

  console.log('— Turnos y cruces');
  const s1 = check('Turno 14:00–22:00 con Carlos y Ana', await call('POST', '/shifts', A, { storeId: store.id, schedulePeriodId: P, date: day(3), startTime: '14:00', endTime: '22:00', breakMinutes: 60, lateToleranceMinutes: 5, employeeIds: [carlos.id, ana] }), 201).body;
  console.log(`     local ${s1.local.date} ${s1.local.startTime}–${s1.local.endTime} | UTC ${s1.startsAt} | laborable ${s1.scheduledWorkMinutes} min`);
  console.log(`     ventana: marca desde ${s1.clockWindow.clockInOpensAt} | tarde después de ${s1.clockWindow.lateAfter}`);
  const s2 = check('Turno nocturno 22:00–06:00 (Carlos)', await call('POST', '/shifts', A, { storeId: store.id, schedulePeriodId: P, date: day(4), startTime: '22:00', endTime: '06:00', employeeIds: [carlos.id] }), 201).body;
  console.log(`     overnight=${s2.local.overnight} | termina ${s2.endsAt}`);
  const conf = check('Carlos 18:00–23:00 el mismo día (se cruza)', await call('POST', '/shifts', A, { storeId: store.id, schedulePeriodId: P, date: day(3), startTime: '18:00', endTime: '23:00', employeeIds: [carlos.id] }), 409, 'SCHEDULE_CONFLICT');
  expect('     el error indica el turno con el que choca', conf.body.details?.conflicts?.[0]?.conflictingShiftId === s1.id);
  check('Carlos 06:00–14:00 (termina justo cuando empieza el otro)', await call('POST', '/shifts', A, { storeId: store.id, schedulePeriodId: P, date: day(3), startTime: '06:00', endTime: '14:00', employeeIds: [carlos.id] }), 201);
  check('Carlos 05:00–10:00 al día siguiente (choca con el nocturno)', await call('POST', '/shifts', A, { storeId: store.id, schedulePeriodId: P, date: day(5), startTime: '05:00', endTime: '10:00', employeeIds: [carlos.id] }), 409, 'SCHEDULE_CONFLICT');
  check('Fecha fuera del periodo', await call('POST', '/shifts', A, { storeId: store.id, schedulePeriodId: P, date: day(25), startTime: '08:00', endTime: '16:00' }), 400, 'SHIFT_OUTSIDE_PERIOD');
  check('Turno en el pasado', await call('POST', '/shifts', A, { storeId: store.id, date: day(-1), startTime: '08:00', endTime: '16:00' }), 400, 'INVALID_SHIFT_TIMING');
  check('Turno de 22 horas', await call('POST', '/shifts', A, { storeId: store.id, date: day(20), startTime: '04:00', endTime: '02:00' }), 400, 'INVALID_SHIFT_TIMING');
  check('Hora inválida (25:00)', await call('POST', '/shifts', A, { storeId: store.id, date: day(20), startTime: '25:00', endTime: '26:00' }), 400, 'VALIDATION_ERROR');
  await call('PATCH', `/employees/${luis}/status`, A, { status: 'TERMINATED', terminationDate: today });
  const na = check('Asignar retirado y empleado de otra empresa', await call('POST', '/shifts', A, { storeId: store.id, schedulePeriodId: P, date: day(6), startTime: '08:00', endTime: '12:00', employeeIds: [luis, empB.id] }), 409, 'EMPLOYEES_NOT_AVAILABLE');
  console.log('    ', JSON.stringify(na.body.details?.unavailable?.map(u => u.reason)));

  console.log('— Creación en lote');
  const before = (await q(`SELECT count(*)::int n FROM shifts`))[0].n;
  const bulk = check('10 turnos de Ana (08:00–16:00) en un solo envío', await call('POST', '/shifts/bulk', A, { storeId: store.id, schedulePeriodId: P, shifts: Array.from({ length: 10 }, (_, i) => ({ date: day(5 + i), startTime: '08:00', endTime: '16:00', employeeIds: [ana] })) }), 201);
  console.log('     creados:', bulk.body.created);
  const mid = (await q(`SELECT count(*)::int n FROM shifts`))[0].n;
  check('Lote con cruce interno (todo o nada)', await call('POST', '/shifts/bulk', A, { storeId: store.id, schedulePeriodId: P, shifts: [{ date: day(15), startTime: '17:00', endTime: '21:00', employeeIds: [sofi] }, { date: day(15), startTime: '20:00', endTime: '23:00', employeeIds: [sofi] }] }), 409, 'SCHEDULE_CONFLICT');
  expect('     no se creó ningún turno del lote fallido', (await q(`SELECT count(*)::int n FROM shifts`))[0].n === mid, `(${before} → ${mid} → ${mid})`);

  console.log('— Publicación');
  let mine = check('Carlos consulta sus turnos (periodo en borrador)', await call('GET', `/me/shifts?from=${day(0)}&to=${day(20)}`, E), 200);
  expect('     no ve nada todavía', mine.body.shifts.length === 0);
  check('Publicar', await call('POST', `/schedule-periods/${P}/publish`, A), 200);
  check('Publicar de nuevo', await call('POST', `/schedule-periods/${P}/publish`, A), 409, 'SCHEDULE_PERIOD_STATUS');
  const notif = await q(`SELECT type, title, body FROM notifications WHERE "userId"=$1`, [carlos.userId]);
  expect('     Carlos recibió notificación de publicación', notif.some(n => n.type === 'SCHEDULE_PUBLISHED'), `"${notif[0]?.title}"`);
  mine = check('Carlos consulta sus turnos (publicado)', await call('GET', `/me/shifts?from=${day(0)}&to=${day(20)}`, E), 200);
  expect(`     ve ${mine.body.shifts.length} turnos, sin datos de compañeros`, mine.body.shifts.length === 3 && !('assignments' in mine.body.shifts[0]));
  check('Cambiar fechas de un periodo publicado', await call('PATCH', `/schedule-periods/${P}`, A, { endDate: day(17) }), 409, 'SCHEDULE_PERIOD_STATUS');
  check('Eliminar un periodo publicado', await call('DELETE', `/schedule-periods/${P}`, A), 409, 'SCHEDULE_PERIOD_STATUS');

  console.log('— Cambios después de publicar (trazabilidad)');
  check('Mover el turno de 14:00 a 15:00–23:00', await call('PATCH', `/shifts/${s1.id}`, A, { startTime: '15:00', endTime: '23:00' }), 200);
  check('Mover un turno a un horario que cruza a Carlos', await call('PATCH', `/shifts/${s1.id}`, A, { date: day(4), startTime: '20:00', endTime: '23:30' }), 409, 'SCHEDULE_CONFLICT');
  check('Agregar a Sofía al turno publicado', await call('POST', `/shifts/${s1.id}/assignments`, A, { employeeIds: [sofi] }), 200);
  check('Retirar a Carlos del nocturno', await call('DELETE', `/shifts/${s2.id}/assignments/${carlos.id}?reason=Cambio%20de%20personal`, A), 200);
  check('Retirarlo otra vez', await call('DELETE', `/shifts/${s2.id}/assignments/${carlos.id}`, A), 404, 'ASSIGNMENT_NOT_FOUND');
  const changes = await q(`SELECT type, count(*)::int n FROM shift_changes GROUP BY type ORDER BY type`);
  console.log('     cambios registrados:', changes.map(c => `${c.type}×${c.n}`).join(', '));
  const n2 = await q(`SELECT title, body FROM notifications WHERE "userId"=$1 AND type='SHIFT_CHANGED' ORDER BY "createdAt"`, [carlos.userId]);
  n2.forEach(n => console.log(`     🔔 ${n.title}: ${n.body}`));
  mine = (await call('GET', `/me/shifts?from=${day(0)}&to=${day(20)}`, E)).body;
  expect('     Carlos ve el nocturno como CANCELLED para él', mine.shifts.find(s => s.id === s2.id)?.myAssignmentStatus === 'CANCELLED');
  check('Cancelar turno', await call('POST', `/shifts/${s1.id}/cancel`, A, { reason: 'Inventario' }), 200);
  check('Cancelarlo otra vez', await call('POST', `/shifts/${s1.id}/cancel`, A, {}), 409, 'SHIFT_CANCELLED');
  check('Asignar a un turno cancelado', await call('POST', `/shifts/${s1.id}/assignments`, A, { employeeIds: [luis] }), 409, 'SHIFT_CANCELLED');
  check('Ahora ese horario queda libre para Carlos', await call('POST', '/shifts', A, { storeId: store.id, schedulePeriodId: P, date: day(3), startTime: '16:00', endTime: '20:00', employeeIds: [carlos.id] }), 201);

  console.log('— Concurrencia: 2 admins asignan a la misma persona a la vez');
  let ok = 0, conflicts = 0;
  for (let i = 0; i < 5; i++) {
    const a = (await call('POST', '/shifts', A, { storeId: store.id, date: day(40 + i), startTime: '08:00', endTime: '16:00' })).body.id;
    const b = (await call('POST', '/shifts', A, { storeId: store.id, date: day(40 + i), startTime: '12:00', endTime: '20:00' })).body.id;
    const rs = await Promise.all([a, b].map(id => call('POST', `/shifts/${id}/assignments`, A, { employeeIds: [sofi] })));
    ok += rs.filter(r => r.status === 200).length; conflicts += rs.filter(r => r.body?.code === 'SCHEDULE_CONFLICT').length;
  }
  expect(`5 rondas simultáneas → ${ok} asignaciones, ${conflicts} rechazos por cruce`, ok === 5 && conflicts === 5);
  const [dup] = await q(`SELECT count(*)::int n FROM shift_assignments a1 JOIN shift_assignments a2 ON a1."employeeId"=a2."employeeId" AND a1.id<a2.id AND a1.status='ASSIGNED' AND a2.status='ASSIGNED' JOIN shifts s1 ON s1.id=a1."shiftId" AND s1.status='SCHEDULED' JOIN shifts s2 ON s2.id=a2."shiftId" AND s2.status='SCHEDULED' WHERE s1."startsAt"<s2."endsAt" AND s2."startsAt"<s1."endsAt"`);
  expect('Verificación directa en SQL: turnos cruzados en toda la base = 0', dup.n === 0, `(${dup.n})`);

  console.log('— Aislamiento, permisos y cierre');
  check('Empresa B lee un turno de A', await call('GET', `/shifts/${s2.id}`, TB), 404, 'SHIFT_NOT_FOUND');
  check('Empresa B asigna a su empleado en turno de A', await call('POST', `/shifts/${s2.id}/assignments`, TB, { employeeIds: [empB.id] }), 404, 'SHIFT_NOT_FOUND');
  check('Empresa B crea turno en tienda de A', await call('POST', '/shifts', TB, { storeId: store.id, date: day(20), startTime: '08:00', endTime: '16:00' }), 404, 'STORE_NOT_FOUND');
  const bCal = (await call('GET', `/shifts?from=${day(0)}&to=${day(60)}`, TB)).body;
  expect('Calendario de B vacío', bCal.length === 0);
  check('Empleado intenta ver el calendario general', await call('GET', `/shifts?from=${day(0)}&to=${day(5)}`, E), 403, 'FORBIDDEN');
  check('Rango de 90 días', await call('GET', `/shifts?from=${day(0)}&to=${day(89)}`, A), 400, 'INVALID_PERIOD_DATES');
  check('Cerrar un periodo que no ha terminado', await call('POST', `/schedule-periods/${P}/close`, A), 409, 'SCHEDULE_PERIOD_STATUS');
  const [past] = await q(`INSERT INTO schedule_periods (id,"companyId","storeId",name,"startDate","endDate",status,"updatedAt") SELECT gen_random_uuid(),"companyId",id,'Quincena pasada',$1,$2,'PUBLISHED',now() FROM stores WHERE code='CENTRO' RETURNING id`, [day(-20), day(-6)]);
  check('Cerrar un periodo terminado', await call('POST', `/schedule-periods/${past.id}/close`, A), 200);
  const draft = (await call('POST', '/schedule-periods', A, { storeId: store.id, startDate: day(50), endDate: day(60) })).body;
  await call('POST', '/shifts', A, { storeId: store.id, schedulePeriodId: draft.id, date: day(51), startTime: '08:00', endTime: '12:00', employeeIds: [ana] });
  check('Eliminar un borrador con turnos', await call('DELETE', `/schedule-periods/${draft.id}`, A), 204);
  expect('     sus turnos también se eliminaron', (await q(`SELECT count(*)::int n FROM shifts WHERE "schedulePeriodId"=$1`, [draft.id]))[0].n === 0);

  const [au] = await q(`SELECT count(*)::int n, count(distinct action)::int k FROM audit_logs WHERE "entityType" IN ('Shift','SchedulePeriod')`);
  console.log(`\nAuditoría de turnos: ${au.n} registros, ${au.k} tipos de acción`);
  await db.end(); console.log(`\n${pass} OK, ${fail} fallos`);
})().catch(e => { console.error(e); process.exit(1); });
