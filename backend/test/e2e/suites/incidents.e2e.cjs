// Prueba de punta a punta: incidents. Se ejecuta con test/e2e/run.mjs (ver README).
const { Client } = require('pg');
const { hash } = require('@node-rs/argon2');
const B = (process.env.E2E_BASE_URL ?? 'http://localhost:3999') + '/api/v1';
let pass = 0, fail = 0;
const call = async (m, p, t, b) => { const r = await fetch(B + p, { method: m, headers: { 'Content-Type': 'application/json', ...(t && { Authorization: 'Bearer ' + t }) }, body: b && JSON.stringify(b) }); const x = await r.text(); return { status: r.status, body: x ? JSON.parse(x) : null }; };
const check = (l, r, s, c) => { const got = r.body?.code ?? r.body?.status ?? r.body?.incident?.status; const ok = r.status === s && (!c || got === c); ok ? pass++ : fail++; console.log(`${ok ? '✔' : '✘'} ${l.padEnd(66)} ${r.status} ${got ?? ''}${ok ? '' : ' ← esperado ' + s + ' ' + (c ?? '') + ' ' + JSON.stringify(r.body).slice(0, 300)}`); return r; };
const expect = (l, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? '✔' : '✘'} ${l}${extra ? '  ' + extra : ''}`); };
const login = async (e) => (await call('POST', '/auth/login', null, { email: e, password: 'Demo123!' })).body.accessToken;
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
const day = (n) => { const d = new Date(today + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const bog = (date, hhmm) => new Date(`${date}T${hhmm}:00-05:00`).toISOString();

(async () => {
  const db = new Client({ connectionString: process.env.E2E_DATABASE_URL }); await db.connect();
  const q = async (s, p) => (await db.query(s, p)).rows;
  const [compB] = await q(`INSERT INTO companies (id,name,slug,status,"updatedAt") VALUES (gen_random_uuid(),'Empresa B','empresa-b','ACTIVE',now()) RETURNING id`);
  const [admRole] = await q(`SELECT id FROM roles WHERE code='COMPANY_ADMIN' AND "companyId" IS NULL`);
  const [uB] = await q(`INSERT INTO users (id,email,"passwordHash","firstName","lastName","updatedAt") VALUES (gen_random_uuid(),'admin@b.local',$1,'Beto','B',now()) RETURNING id`, [await hash('Demo123!')]);
  await db.query(`INSERT INTO company_memberships (id,"companyId","userId","roleId","updatedAt") VALUES (gen_random_uuid(),$1,$2,$3,now())`, [compB.id, uB.id, admRole.id]);

  const A = await login('admin@demo.local');
  const [store] = await q(`SELECT id, "companyId" FROM stores WHERE code='CENTRO'`);
  const [carlos] = await q(`SELECT id, "userId" FROM employees WHERE code='EMP-001'`);
  const ana = (await call('POST', '/employees', A, { code: 'E-ANA', documentType: 'CC', documentNumber: '111', firstName: 'Ana', lastName: 'Ruiz', hireDate: '2026-01-10' })).body.id;
  // Laura: supervisora y también empleada
  const sup = (await call('GET', '/roles', A)).body.find(r => r.code === 'SUPERVISOR');
  await call('POST', '/users', A, { email: 'laura@demo.local', firstName: 'Laura', lastName: 'Gómez', password: 'Demo123!', roleId: sup.id });
  const laura = (await call('POST', '/employees', A, { code: 'E-LAURA', documentType: 'CC', documentNumber: '222', firstName: 'Laura', lastName: 'Gómez', email: 'laura@demo.local', hireDate: '2026-01-10' })).body.id;
  await call('POST', `/employees/${laura}/access`, A, {});
  await db.query(`UPDATE users SET "mustChangePassword"=false`); // ya cambiaron la temporal
  const C = await login('empleado@demo.local'), L = await login('laura@demo.local'), TB = await login('admin@b.local');

  // Historial pasado (14:00–22:00, 60 min de descanso)
  const past = async (emp, date, status, m = {}) => {
    const [s] = await q(`INSERT INTO shifts (id,"companyId","storeId","startsAt","endsAt","breakMinutes","lateToleranceMinutes","updatedAt") VALUES (gen_random_uuid(),$1,$2,$3,$4,60,5,now()) RETURNING id`, [store.companyId, store.id, bog(date, '14:00'), bog(date, '22:00')]);
    const [a] = await q(`INSERT INTO shift_assignments (id,"companyId","shiftId","employeeId","updatedAt") VALUES (gen_random_uuid(),$1,$2,$3,now()) RETURNING id`, [store.companyId, s.id, emp]);
    const [att] = await q(`INSERT INTO attendances (id,"companyId","shiftAssignmentId","employeeId","workDate",status,"clockInAt","clockOutAt","lateMinutes","earlyLeaveMinutes","workedMinutes","overtimeMinutes","needsReview","reviewReasons","updatedAt") VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now()) RETURNING id`,
      [store.companyId, a.id, emp, date, status, m.in ?? null, m.out ?? null, m.late ?? 0, m.early ?? 0, m.worked ?? 0, m.ot ?? 0, !!m.reasons, m.reasons ?? []]);
    return att.id;
  };
  const dLate = await past(carlos.id, day(-3), 'COMPLETED', { in: bog(day(-3), '14:20'), out: bog(day(-3), '22:45'), late: 20, ot: 45, worked: 445 });
  const dAbsent = await past(carlos.id, day(-2), 'ABSENT', { reasons: ['NO_CLOCK_IN'] });
  const dIncomplete = await past(carlos.id, day(-1), 'INCOMPLETE', { in: bog(day(-1), '13:58'), reasons: ['MISSING_CLOCK_OUT'] });
  const dEarly = await past(carlos.id, day(-4), 'COMPLETED', { in: bog(day(-4), '14:00'), out: bog(day(-4), '21:30'), early: 30, worked: 390 });
  const anaAtt = await past(ana, day(-3), 'COMPLETED', { in: bog(day(-3), '14:30'), out: bog(day(-3), '22:00'), late: 30, worked: 390 });
  const future = (await call('POST', '/shifts', A, { storeId: store.id, date: day(2), startTime: '14:00', endTime: '22:00', employeeIds: [carlos.id] })).body;

  console.log('— Solicitudes del empleado');
  check('Justificar 30 min de tardanza (solo llegó 20 tarde)', await call('POST', '/me/incidents', C, { type: 'LATE_ARRIVAL', attendanceId: dLate, minutes: 30, description: 'Trancón por accidente' }), 400, 'INVALID_INCIDENT');
  const late = check('Justificar 15 de los 20 min de tardanza', await call('POST', '/me/incidents', C, { type: 'LATE_ARRIVAL', attendanceId: dLate, minutes: 15, description: 'Trancón por accidente' }), 201, 'PENDING').body;
  check('La misma justificación otra vez', await call('POST', '/me/incidents', C, { type: 'LATE_ARRIVAL', attendanceId: dLate, description: 'Otra vez' }), 409, 'INCIDENT_DUPLICATE');
  const ot = check('Horas extra (por defecto, las 45 registradas)', await call('POST', '/me/incidents', C, { type: 'OVERTIME', attendanceId: dLate, description: 'Cierre de inventario' }), 201, 'PENDING').body;
  console.log(`     minutos solicitados: ${ot.minutes}`);
  check('Corrección de marcación: salida antes de la entrada', await call('POST', '/me/incidents', C, { type: 'MISSED_CLOCK', attendanceId: dIncomplete, clockOutAt: bog(day(-1), '13:00'), description: 'Olvidé marcar' }), 400, 'INVALID_INCIDENT');
  const missed = check('Corrección de marcación: salí a las 22:00', await call('POST', '/me/incidents', C, { type: 'MISSED_CLOCK', attendanceId: dIncomplete, clockOutAt: bog(day(-1), '22:00'), description: 'Se me descargó el celular' }), 201, 'PENDING').body;
  check('Justificar ausencia en una jornada completada', await call('POST', '/me/incidents', C, { type: 'ABSENCE', attendanceId: dEarly, description: 'No aplica' }), 400, 'INVALID_INCIDENT');
  check('Justificar la jornada de OTRA persona', await call('POST', '/me/incidents', C, { type: 'LATE_ARRIVAL', attendanceId: anaAtt, description: 'Intento indebido' }), 404, 'ATTENDANCE_NOT_FOUND');
  const sick = check(`Incapacidad del ${day(-2)} al ${day(3)}`, await call('POST', '/me/incidents', C, { type: 'SICK_LEAVE', startDate: day(-2), endDate: day(3), description: 'Gripa fuerte', attachmentUrl: 'https://archivos.ejemplo.com/incapacidad.pdf' }), 201, 'PENDING').body;
  check('Otra incapacidad que se cruza', await call('POST', '/me/incidents', C, { type: 'SICK_LEAVE', startDate: day(1), endDate: day(5), description: 'Cruce' }), 409, 'TIME_OFF_OVERLAP');
  check('Permiso por horas invertidas (10:00–08:00)', await call('POST', '/me/incidents', C, { type: 'PERMISSION', date: day(10), startTime: '10:00', endTime: '08:00', description: 'Cita médica' }), 400, 'INVALID_INCIDENT');
  check('Adjunto con http (no https)', await call('POST', '/me/incidents', C, { type: 'OTHER', startDate: day(0), description: 'Prueba', attachmentUrl: 'http://inseguro.com/x.pdf' }), 400, 'VALIDATION_ERROR');
  check('Novedad de hace 70 días', await call('POST', '/me/incidents', C, { type: 'OTHER', startDate: day(-70), description: 'Muy vieja' }), 400, 'INVALID_INCIDENT');
  check('Empleado intenta aprobar', await call('POST', `/incidents/${late.id}/approve`, C, {}), 403, 'FORBIDDEN');

  console.log('— Bandeja y aprobación');
  const inbox = check('Bandeja de pendientes', await call('GET', '/incidents?status=PENDING', A), 200);
  console.log('    ', inbox.body.items.map(i => i.type).join(', '));
  check('Aprobar tardanza', await call('POST', `/incidents/${late.id}/approve`, A, { notes: 'OK, hubo cierre vial' }), 200, 'APPROVED');
  check('Aprobarla de nuevo', await call('POST', `/incidents/${late.id}/approve`, A, {}), 409, 'INCIDENT_STATUS');
  check('Aprobar 60 min de extra (solo pidió 45)', await call('POST', `/incidents/${ot.id}/approve`, A, { minutes: 60 }), 400, 'INVALID_INCIDENT');
  const otOk = check('Aprobar solo 30 de los 45 min extra', await call('POST', `/incidents/${ot.id}/approve`, A, { minutes: 30, notes: 'Solo 30 autorizados' }), 200, 'APPROVED');
  console.log(`     minutos aprobados: ${otOk.body.incident.minutes}`);

  check('Aprobar corrección de marcación', await call('POST', `/incidents/${missed.id}/approve`, A, {}), 200, 'APPROVED');
  const [adj] = await q(`SELECT status, "workedMinutes", "needsReview", (SELECT count(*)::int FROM attendance_events WHERE "attendanceId"=$1 AND type='MANUAL_ADJUSTMENT') AS adjustments FROM attendances WHERE id=$1`, [dIncomplete]);
  expect(`     la jornada se corrigió: ${adj.status}, ${adj.workedMinutes} min, needsReview=${adj.needsReview}, ajustes=${adj.adjustments}`, adj.status === 'COMPLETED' && !adj.needsReview && adj.adjustments === 1);

  const sAp = check('Aprobar incapacidad', await call('POST', `/incidents/${sick.id}/approve`, A, {}), 200, 'APPROVED');
  expect(`     avisa del turno futuro afectado: ${sAp.body.affectedShifts.map(s => s.description).join('; ')}`, sAp.body.affectedShifts.some(s => s.shiftId === future.id));
  const [abs] = await q(`SELECT "needsReview" FROM attendances WHERE id=$1`, [dAbsent]);
  expect('     la ausencia cubierta salió de la bandeja de revisión', abs.needsReview === false);
  const onLeave = check('Asignar a Carlos un turno durante la incapacidad', await call('POST', '/shifts', A, { storeId: store.id, date: day(3), startTime: '08:00', endTime: '12:00', employeeIds: [carlos.id] }), 409, 'EMPLOYEES_NOT_AVAILABLE');
  console.log('    ', JSON.stringify(onLeave.body.details?.unavailable));

  console.log('— Rechazo, retiro, anulación y concurrencia');
  const gps = (await call('POST', '/me/incidents', C, { type: 'GPS_APP_ISSUE', attendanceId: dEarly, description: 'La app no abría' })).body;
  check('Rechazar sin nota', await call('POST', `/incidents/${gps.id}/reject`, A, {}), 400, 'VALIDATION_ERROR');
  check('Rechazar con nota', await call('POST', `/incidents/${gps.id}/reject`, A, { notes: 'No hay reporte técnico de fallas ese día' }), 200, 'REJECTED');
  const other = (await call('POST', '/me/incidents', C, { type: 'OTHER', startDate: day(0), description: 'Consulta' })).body;
  check('Carlos retira su solicitud', await call('POST', `/me/incidents/${other.id}/cancel`, C), 200, 'CANCELLED');
  check('La retira otra vez', await call('POST', `/me/incidents/${other.id}/cancel`, C), 409, 'INCIDENT_STATUS');
  check('Anular la tardanza aprobada', await call('POST', `/incidents/${late.id}/revoke`, A, { notes: 'Se verificó que no hubo cierre vial' }), 200, 'CANCELLED');
  check('Anular una corrección de marcación ya aplicada', await call('POST', `/incidents/${missed.id}/revoke`, A, { notes: 'Error' }), 409, 'INCIDENT_STATUS');
  const early = (await call('POST', '/me/incidents', C, { type: 'EARLY_DEPARTURE', attendanceId: dEarly, description: 'Cita médica' })).body;
  const race = await Promise.all([call('POST', `/incidents/${early.id}/approve`, A, {}), call('POST', `/incidents/${early.id}/approve`, L, {})]);
  expect(`Dos supervisores aprueban a la vez → ${race.map(r => r.status).sort().join(' y ')}`, race.map(r => r.status).sort().join() === '200,409');

  console.log('— Autoaprobación y registro directo');
  check('Laura (supervisora) se registra una incapacidad a sí misma', await call('POST', '/incidents', L, { employeeId: laura, type: 'SICK_LEAVE', startDate: day(5), description: 'Autoaprobación' }), 403, 'SELF_APPROVAL_FORBIDDEN');
  check('Laura registra la incapacidad de Ana (queda aprobada)', await call('POST', '/incidents', L, { employeeId: ana, type: 'SICK_LEAVE', startDate: day(1), endDate: day(2), description: 'Entregó el soporte en físico' }), 201, 'APPROVED');

  console.log('— Notificaciones a Carlos');
  (await q(`SELECT title, body FROM notifications WHERE "userId"=$1 AND type='INCIDENT_RESOLVED' ORDER BY "createdAt"`, [carlos.userId])).forEach(n => console.log(`     🔔 ${n.title} — ${n.body}`));

  console.log('— Consolidado para nómina');
  const ts = check(`Consolidado del ${day(-5)} al ${day(5)}`, await call('GET', `/timesheets?from=${day(-5)}&to=${day(5)}`, A), 200);
  const cr = ts.body.rows.find(r => r.employee.id === carlos.id);
  console.log(`     Carlos: ${cr.shifts} jornadas | programado ${cr.scheduledMinutes} | trabajado ${cr.workedMinutes}`);
  console.log(`       tardanza ${JSON.stringify(cr.late)}   (la justificación se anuló)`);
  console.log(`       salida anticipada ${JSON.stringify(cr.earlyLeave)}`);
  console.log(`       extra ${JSON.stringify(cr.overtime)}`);
  console.log(`       ausencias ${JSON.stringify(cr.absences)} | incapacidad ${cr.sickLeaveDays} días | sin salida ${cr.incomplete}`);
  expect('     cifras correctas',
    cr.late.unexcused === 20 && cr.late.excused === 0 &&
    cr.earlyLeave.excused === 30 &&
    cr.overtime.recorded === 45 && cr.overtime.approved === 30 && cr.overtime.unapproved === 15 &&
    cr.absences.justified === 1 && cr.absences.unjustified === 0 &&
    cr.sickLeaveDays === 6 && cr.incomplete === 0);
  const ar = ts.body.rows.find(r => r.employee.id === ana);
  console.log(`     Ana: tardanza ${JSON.stringify(ar.late)} | incapacidad ${ar.sickLeaveDays} días`);

  console.log('— Aislamiento y permisos');
  check('Empresa B consulta una novedad de A', await call('GET', `/incidents/${sick.id}`, TB), 404, 'INCIDENT_NOT_FOUND');
  check('Empresa B anula una novedad de A', await call('POST', `/incidents/${sick.id}/revoke`, TB, { notes: 'Ataque' }), 404, 'INCIDENT_NOT_FOUND');
  check('Empresa B registra novedad para empleado de A', await call('POST', '/incidents', TB, { employeeId: carlos.id, type: 'OTHER', startDate: day(0), description: 'Ataque' }), 400, 'INVALID_INCIDENT');
  expect('Consolidado de B vacío', (await call('GET', `/timesheets?from=${day(-5)}&to=${day(5)}`, TB)).body.rows.length === 0);
  check('Empleado consulta el consolidado', await call('GET', `/timesheets?from=${day(-5)}&to=${day(5)}`, C), 403, 'FORBIDDEN');
  const mine = check('Carlos ve solo sus novedades', await call('GET', '/me/incidents?pageSize=50', C), 200);
  expect(`     ${mine.body.total} novedades, todas suyas`, mine.body.items.every(i => i.employee.id === carlos.id));
  await db.end(); console.log(`\n${pass} OK, ${fail} fallos`);
})().catch(e => { console.error(e); process.exit(1); });
