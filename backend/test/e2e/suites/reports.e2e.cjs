// Prueba de punta a punta: reports. Se ejecuta con test/e2e/run.mjs (ver README).
const { Client } = require('pg');
const { hash } = require('@node-rs/argon2');
const { Workbook } = require('exceljs');
const B = (process.env.E2E_BASE_URL ?? 'http://localhost:3999') + '/api/v1';
let pass = 0, fail = 0;
const call = async (m, p, t, b) => { const r = await fetch(B + p, { method: m, headers: { 'Content-Type': 'application/json', ...(t && { Authorization: 'Bearer ' + t }) }, body: b && JSON.stringify(b) }); const ct = r.headers.get('content-type') ?? ''; if (!ct.includes('json')) return { status: r.status, headers: r.headers, buffer: Buffer.from(await r.arrayBuffer()) }; const x = await r.text(); return { status: r.status, headers: r.headers, body: x ? JSON.parse(x) : null }; };
const check = (l, r, s, c) => { const ok = r.status === s && (!c || r.body?.code === c); ok ? pass++ : fail++; console.log(`${ok ? '✔' : '✘'} ${l.padEnd(64)} ${r.status} ${r.body?.code ?? ''}${ok ? '' : ' ← esperado ' + s + ' ' + (c ?? '') + ' ' + JSON.stringify(r.body).slice(0, 250)}`); return r; };
const expect = (l, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? '✔' : '✘'} ${l}${extra ? '  ' + extra : ''}`); };
const login = async (email) => (await call('POST', '/auth/login', null, { email, password: 'Demo123!' })).body.accessToken;
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
const day = (n) => { const d = new Date(today + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

(async () => {
  const db = new Client({ connectionString: process.env.E2E_DATABASE_URL }); await db.connect();
  const q = async (s, p) => (await db.query(s, p)).rows;
  const [compB] = await q(`INSERT INTO companies (id,name,slug,status,"updatedAt") VALUES (gen_random_uuid(),'Empresa B','empresa-b','ACTIVE',now()) RETURNING id`);
  const [admRole] = await q(`SELECT id FROM roles WHERE code='COMPANY_ADMIN' AND "companyId" IS NULL`);
  const [uB] = await q(`INSERT INTO users (id,email,"passwordHash","firstName","lastName","updatedAt") VALUES (gen_random_uuid(),'admin@b.local',$1,'Beto','B',now()) RETURNING id`, [await hash('Demo123!')]);
  await db.query(`INSERT INTO company_memberships (id,"companyId","userId","roleId","updatedAt") VALUES (gen_random_uuid(),$1,$2,$3,now())`, [compB.id, uB.id, admRole.id]);

  const A = await login('admin@demo.local'), C = await login('empleado@demo.local'), TB = await login('admin@b.local');
  const [centro] = await q(`SELECT id, "companyId" FROM stores WHERE code='CENTRO'`);
  const co = centro.companyId;
  const norte = (await call('POST', '/stores', A, { code: 'NORTE', name: 'Tienda Norte', latitude: 4.68, longitude: -74.05 })).body.id;
  const [carlos] = await q(`SELECT id FROM employees WHERE code='EMP-001'`);
  const mk = async (code, name) => (await call('POST', '/employees', A, { code, documentType: 'CC', documentNumber: code.replace(/\D/g, '') + '0001', firstName: name, lastName: 'Test', hireDate: '2026-01-01' })).body.id;
  const [ana, luis, pedro, sofia, marta] = [await mk('E-11', 'Ana'), await mk('E-12', 'Luis'), await mk('E-13', 'Pedro'), await mk('E-14', 'Sofía'), await mk('E-15', 'Marta')];

  // Turno relativo a "ahora" (minutos) y su asistencia
  const shift = async (emp, store, startMin, endMin, att) => {
    const [s] = await q(`INSERT INTO shifts (id,"companyId","storeId","startsAt","endsAt","breakMinutes","lateToleranceMinutes","updatedAt") VALUES (gen_random_uuid(),$1,$2,now()+($3||' min')::interval,now()+($4||' min')::interval,0,5,now()) RETURNING id`, [co, store, startMin, endMin]);
    const [a] = await q(`INSERT INTO shift_assignments (id,"companyId","shiftId","employeeId","updatedAt") VALUES (gen_random_uuid(),$1,$2,$3,now()) RETURNING id`, [co, s.id, emp]);
    if (att) await q(`INSERT INTO attendances (id,"companyId","shiftAssignmentId","employeeId","workDate",status,"clockInAt","clockOutAt","lateMinutes","workedMinutes","needsReview","updatedAt") VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,now()+($6||' min')::interval,$7,$8,$9,$10,now())`, [co, a.id, emp, today, att.status, att.inMin, att.out ?? null, att.late ?? 0, att.worked ?? 0, att.review ?? false]);
    return a.id;
  };
  await shift(carlos.id, centro.id, -60, 420, { status: 'IN_PROGRESS', inMin: -58 });                  // en turno
  await shift(ana, centro.id, -30, 450);                                                                // sin marcar
  await shift(luis, centro.id, -500, -20, { status: 'IN_PROGRESS', inMin: -498 });                     // salida pendiente
  await shift(pedro, centro.id, 120, 600);                                                              // por llegar
  await shift(sofia, centro.id, -10, 470);                                                              // incapacidad
  await shift(marta, norte, -180, -60, { status: 'COMPLETED', inMin: -168, out: new Date(Date.now() - 3600_000), late: 12, worked: 108 }); // completó, tarde
  await call('POST', '/incidents', A, { employeeId: sofia, type: 'SICK_LEAVE', startDate: today, description: 'Incapacidad' });

  // El escenario usa turnos de hasta ~8 h antes de "ahora": si el día lleva pocas horas, parte
  // de ellos quedan en "ayer" y no salen en el dashboard de hoy. Se omite (no se falla).
  const minutesToday = (() => { const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()).split(':').map(Number); return h * 60 + m; })();
  // …y el turno "por llegar" empieza en 2 h: después de las 22:00 cae en "mañana"
  const dayCheck = minutesToday >= 540 && minutesToday < 1320 ? expect : (l) => console.log(`⚠ omitido (en Bogotá son las ${Math.floor(minutesToday / 60)}:${String(minutesToday % 60).padStart(2, '0')}; requiere entre las 9:00 y las 22:00): ${l.trim()}`);
  console.log(`— Dashboard (hoy ${today})`);
  const d = check('Dashboard del día', await call('GET', '/reports/dashboard', A), 200).body;
  const st = Object.fromEntries(d.people.map(p => [p.name.split(' ')[0], p.statusLabel]));
  console.log('    ', Object.entries(st).map(([n, s]) => `${n}: ${s}`).join(' · '));
  dayCheck('     cada persona en su estado', st.Carlos === 'En turno' && st.Ana === 'Sin marcar entrada' && st.Luis === 'Salida pendiente' && st.Pedro === 'Por llegar' && st['Sofía'] === 'Incapacidad/permiso' && st.Marta === 'Completó');
  const t = d.totals;
  console.log(`     totales: programados ${t.scheduled} · en turno ${t.WORKING} · sin marcar ${t.MISSING} · salida pendiente ${t.PENDING_EXIT} · tarde ${t.late}`);
  dayCheck('     totales correctos', t.scheduled === 6 && t.WORKING === 1 && t.MISSING === 1 && t.PENDING_EXIT === 1 && t.UPCOMING === 1 && t.ON_TIME_OFF === 1 && t.COMPLETED === 1 && t.late === 1);
  const miss = d.attention.missingClockIn[0], exit = d.attention.pendingExit[0];
  expect(`     atención: ${miss?.name} lleva ${miss?.minutesOverdue} min sin marcar; ${exit?.name} debe la salida hace ${exit?.minutesOverdue} min`, miss?.minutesOverdue >= 29 && exit?.minutesOverdue >= 19);
  dayCheck(`     por establecimiento: ${d.byStore.map(s => `${s.storeName} ${s.counters.scheduled}`).join(', ')}`, d.byStore.length === 2);
  const dn = check('Filtrado por Tienda Norte', await call('GET', `/reports/dashboard?storeId=${norte}`, A), 200).body;
  dayCheck('     solo Marta', dn.people.length === 1 && dn.people[0].name.startsWith('Marta'));
  console.log(`     pendientes: ${JSON.stringify(d.pending)}`);

  console.log('— Detalle de asistencia');
  // Jornada pasada de Carlos con tardanza justificada
  await (async () => {
    const [s] = await q(`INSERT INTO shifts (id,"companyId","storeId","startsAt","endsAt","breakMinutes","updatedAt") VALUES (gen_random_uuid(),$1,$2,($3||' 14:00-05')::timestamptz,($3||' 22:00-05')::timestamptz,60,now()) RETURNING id`, [co, centro.id, day(-2)]);
    const [a] = await q(`INSERT INTO shift_assignments (id,"companyId","shiftId","employeeId","updatedAt") VALUES (gen_random_uuid(),$1,$2,$3,now()) RETURNING id`, [co, s.id, carlos.id]);
    const [att] = await q(`INSERT INTO attendances (id,"companyId","shiftAssignmentId","employeeId","workDate",status,"clockInAt","clockOutAt","lateMinutes","workedMinutes","overtimeMinutes","updatedAt") VALUES (gen_random_uuid(),$1,$2,$3,$4::date,'COMPLETED',($4::text||' 14:15-05')::timestamptz,($4::text||' 22:30-05')::timestamptz,15,435,30,now()) RETURNING id`, [co, a.id, carlos.id, day(-2)]);
    await q(`INSERT INTO incidents (id,"companyId","employeeId","attendanceId",type,status,"startsAt",minutes,"updatedAt") VALUES (gen_random_uuid(),$1,$2,$3,'LATE_ARRIVAL','APPROVED',now(),15,now())`, [co, carlos.id, att.id]);
  })();
  const rep = check(`Vista previa del ${day(-3)} al ${today}`, await call('GET', `/reports/attendance?from=${day(-3)}&to=${today}`, A), 200).body;
  const carlosPast = rep.rows.find(r => r.name.startsWith('Carlos') && r.date === day(-2));
  console.log(`     ${rep.rows.length} filas · Carlos ${carlosPast.date}: turno ${carlosPast.shift}, entró ${carlosPast.in}, salió ${carlosPast.out}, ${carlosPast.status}, novedades: "${carlosPast.justifications}"`);
  expect('     horas locales y justificación aprobada', carlosPast.in === '14:15' && carlosPast.out === '22:30' && carlosPast.justifications === 'Tardanza justificada');
  check('Rango de 90 días', await call('GET', `/reports/attendance?from=${day(-89)}&to=${today}`, A), 400, 'INVALID_DATE_RANGE');

  console.log('— Exportación');
  const x = check('Descargar en Excel', await call('GET', `/reports/attendance/export?format=xlsx&from=${day(-3)}&to=${today}`, A), 200);
  console.log(`     ${x.headers.get('content-disposition')} · ${x.buffer.length} bytes`);
  const wb = new Workbook(); await wb.xlsx.load(x.buffer);
  const sh = wb.worksheets[0];
  const headers = sh.getRow(4).values.slice(1);
  const lastRow = sh.rowCount;
  expect(`     encabezados: ${headers.slice(0, 6).join(' | ')}…`, headers[0] === 'Fecha' && headers.includes('Novedades aprobadas'));
  expect(`     ${lastRow - 5} filas de datos + fila "${sh.getCell(lastRow, 1).value}"`, lastRow - 5 === rep.rows.length && sh.getCell(lastRow, 1).value === 'Total');
  const workedCol = headers.indexOf('Trabajado') + 1;
  expect(`     "Trabajado" con formato de duración (${sh.getCell(5, workedCol).numFmt})`, sh.getCell(5, workedCol).numFmt === '[h]:mm');
  const p = check('Descargar en PDF', await call('GET', `/reports/attendance/export?format=pdf&from=${day(-3)}&to=${today}`, A), 200);
  expect(`     PDF válido (${p.buffer.length} bytes, ${p.headers.get('content-type')})`, p.buffer.subarray(0, 5).toString() === '%PDF-');
  const ts = check('Consolidado para nómina en Excel', await call('GET', `/reports/timesheet/export?format=xlsx&from=${day(-3)}&to=${today}`, A), 200);
  const wb2 = new Workbook(); await wb2.xlsx.load(ts.buffer);
  const tsHeaders = wb2.worksheets[0].getRow(4).values.slice(1);
  expect(`     columnas: ${tsHeaders.slice(0, 5).join(' | ')}…`, tsHeaders.includes('Extra aprobada') && tsHeaders.includes('Ausencias injustif.'));
  check('Formato no soportado (docx)', await call('GET', `/reports/attendance/export?format=docx&from=${today}&to=${today}`, A), 400, 'VALIDATION_ERROR');

  console.log('— Permisos y aislamiento');
  check('Empleado consulta el dashboard', await call('GET', '/reports/dashboard', C), 403, 'FORBIDDEN');
  check('Empleado exporta', await call('GET', `/reports/attendance/export?format=xlsx&from=${today}&to=${today}`, C), 403, 'FORBIDDEN');
  const b = check('Empresa B consulta su dashboard', await call('GET', '/reports/dashboard', TB), 200).body;
  expect('     no ve a nadie de A', b.totals.scheduled === 0);
  const bx = check('Empresa B exporta', await call('GET', `/reports/attendance/export?format=xlsx&from=${day(-3)}&to=${today}`, TB), 200);
  const wb3 = new Workbook(); await wb3.xlsx.load(bx.buffer);
  expect('     su archivo no trae filas de A', wb3.worksheets[0].rowCount <= 4);

  console.log('— Auditoría');
  const au = check('Consultar exportaciones (action=report.)', await call('GET', '/audit-logs?action=report.', A), 200).body;
  console.log(`     ${au.total} exportaciones · la última: ${au.items[0].after.format} por ${au.items[0].actor?.name} (${au.items[0].after.rows} filas)`);
  expect('     cada descarga quedó registrada con su autor', au.total === 3 && au.items.every(i => i.actor?.email === 'admin@demo.local'));
  const emp = check('Historial de un empleado (entityId)', await call('GET', `/audit-logs?entityType=Employee&entityId=${ana}`, A), 200).body;
  console.log(`     Ana: ${emp.items.map(i => i.action).join(', ')}`);
  check('Rango invertido', await call('GET', `/audit-logs?from=${today}&to=${day(-5)}`, A), 400, 'INVALID_DATE_RANGE');
  check('Empleado consulta la auditoría', await call('GET', '/audit-logs', C), 403, 'FORBIDDEN');
  const bau = (await call('GET', '/audit-logs?action=report.', TB)).body;
  expect(`Empresa B solo ve su propia auditoría (${bau.total} exportación)`, bau.total === 1);
  await db.end(); console.log(`\n${pass} OK, ${fail} fallos`);
})().catch(e => { console.error(e); process.exit(1); });
