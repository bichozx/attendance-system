// Día de demostración para el dashboard (y para las pruebas del panel). Úselo después del seed:
//   DATABASE_URL=... node scripts/demo-day.cjs
// Día de demostración: una persona en cada estado + pendientes por aprobar.
const { Client } = require('pg');
(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL }); await db.connect();
  const q = async (s, p) => (await db.query(s, p)).rows;
  const [centro] = await q(`SELECT id, "companyId" FROM stores WHERE code='CENTRO'`);
  const co = centro.companyId;
  const [norte] = await q(`INSERT INTO stores (id,"companyId",code,name,latitude,longitude,"updatedAt") VALUES (gen_random_uuid(),$1,'NORTE','Tienda Norte',4.68,-74.05,now()) RETURNING id`, [co]);
  const [carlos] = await q(`SELECT id FROM employees WHERE code='EMP-001'`);
  const mk = async (code, first, last) => (await q(`INSERT INTO employees (id,"companyId",code,"documentType","documentNumber","firstName","lastName","hireDate","updatedAt") VALUES (gen_random_uuid(),$1,$2,'CC',$3,$4,$5,'2026-01-10',now()) RETURNING id`, [co, code, code.replace(/\D/g, '') + '77', first, last]))[0].id;
  const ana = await mk('E-11', 'Ana', 'Gómez'), luis = await mk('E-12', 'Luis', 'Martínez'), pedro = await mk('E-13', 'Pedro', 'Rojas'), sofia = await mk('E-14', 'Sofía', 'Herrera'), marta = await mk('E-15', 'Marta', 'Salazar'), jorge = await mk('E-16', 'Jorge', 'Castaño');
  const shift = async (emp, store, startMin, endMin, att) => {
    const [s] = await q(`INSERT INTO shifts (id,"companyId","storeId","startsAt","endsAt","lateToleranceMinutes","updatedAt") VALUES (gen_random_uuid(),$1,$2,date_trunc('minute',now())+($3||' min')::interval,date_trunc('minute',now())+($4||' min')::interval,5,now()) RETURNING id`, [co, store, startMin, endMin]);
    const [a] = await q(`INSERT INTO shift_assignments (id,"companyId","shiftId","employeeId","updatedAt") VALUES (gen_random_uuid(),$1,$2,$3,now()) RETURNING id`, [co, s.id, emp]);
    if (att) await q(`INSERT INTO attendances (id,"companyId","shiftAssignmentId","employeeId","workDate",status,"clockInAt","clockOutAt","lateMinutes","workedMinutes","needsReview","reviewReasons","updatedAt") VALUES (gen_random_uuid(),$1,$2,$3,(now() AT TIME ZONE 'America/Bogota')::date,$4,now()+($5||' min')::interval,$6,$7,$8,$9,$10,now())`, [co, a.id, emp, att.status, att.inMin, att.out ?? null, att.late ?? 0, att.worked ?? 0, att.review ?? false, att.reasons ?? []]);
  };
  await shift(carlos.id, centro.id, -150, 330, { status: 'IN_PROGRESS', inMin: -152 });
  await shift(ana, centro.id, -35, 445);
  await shift(luis, centro.id, -500, -25, { status: 'IN_PROGRESS', inMin: -497 });
  await shift(pedro, norte.id, 90, 570);
  await shift(sofia, centro.id, -60, 420);
  await shift(marta, norte.id, -420, -60, { status: 'COMPLETED', inMin: -408, out: new Date(Date.now() - 3600_000), late: 12, worked: 348, review: true, reasons: ['LATE_SYNC'] });
  await shift(jorge, norte.id, -90, 390, { status: 'IN_PROGRESS', inMin: -71, late: 19 });
  await q(`INSERT INTO incidents (id,"companyId","employeeId",type,status,"startsAt","endsAt",description,"updatedAt") VALUES (gen_random_uuid(),$1,$2,'SICK_LEAVE','APPROVED',date_trunc('day',now()),date_trunc('day',now())+interval '1 day','Incapacidad médica',now())`, [co, sofia]);
  await q(`INSERT INTO incidents (id,"companyId","employeeId",type,status,"startsAt",minutes,description,"updatedAt") VALUES (gen_random_uuid(),$1,$2,'LATE_ARRIVAL','PENDING',now(),19,'Hubo un accidente en la avenida y el bus se demoró',now())`, [co, jorge]);
  // Cambio de turno acordado entre compañeros, esperando al supervisor
  const future = async (emp, dayOffset, from, to) => {
    const [s] = await q(`INSERT INTO shifts (id,"companyId","storeId","startsAt","endsAt","updatedAt") VALUES (gen_random_uuid(),$1,$2,((now() AT TIME ZONE 'America/Bogota')::date + $3::int + $4::time) AT TIME ZONE 'America/Bogota',((now() AT TIME ZONE 'America/Bogota')::date + $3::int + $5::time) AT TIME ZONE 'America/Bogota',now()) RETURNING id, "startsAt", "endsAt"`, [co, centro.id, dayOffset, from, to]);
    const [a] = await q(`INSERT INTO shift_assignments (id,"companyId","shiftId","employeeId","updatedAt") VALUES (gen_random_uuid(),$1,$2,$3,now()) RETURNING id`, [co, s.id, emp]);
    return { ...s, assignmentId: a.id };
  };
  const mine = await future(carlos.id, 2, '14:00', '22:00');
  const theirs = await future(ana, 3, '06:00', '14:00');
  const [u] = await q(`SELECT "userId" FROM employees WHERE id=$1`, [carlos.id]);
  await q(`INSERT INTO shift_changes (id,"companyId","shiftAssignmentId","counterpartAssignmentId",type,status,"isRequest","fromEmployeeId","toEmployeeId","previousStartsAt","previousEndsAt","newStartsAt","newEndsAt",reason,"requestedById","peerRespondedAt","peerAccepted","updatedAt") VALUES (gen_random_uuid(),$1,$2,$3,'SWAP','PENDING',true,$4,$5,$6,$7,$8,$9,'Tengo cita médica en la tarde',$10,now(),true,now())`, [co, mine.assignmentId, theirs.assignmentId, carlos.id, ana, mine.startsAt, mine.endsAt, theirs.startsAt, theirs.endsAt, u.userId]);
  await db.end(); console.log('día de demostración listo');
})().catch((e) => { console.error(e); process.exit(1); });
