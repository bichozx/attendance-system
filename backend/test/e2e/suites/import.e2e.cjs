// Prueba de punta a punta: import. Se ejecuta con test/e2e/run.mjs (ver README).
const { Client } = require('pg');
const { hash } = require('@node-rs/argon2');
const { Workbook } = require('exceljs');
const fs = require('fs');
const B = (process.env.E2E_BASE_URL ?? 'http://localhost:3999') + '/api/v1';
let pass = 0, fail = 0;
// El ejecutor sube el límite de logins para las pruebas; sin él, hay que esperar el minuto
const RATE_PAUSE = Number(process.env.E2E_RATE_PAUSE_MS ?? 61_000);
const call = async (m, p, t, b) => { const r = await fetch(B + p, { method: m, headers: { 'Content-Type': 'application/json', ...(t && { Authorization: 'Bearer ' + t }) }, body: b && JSON.stringify(b) }); const ct = r.headers.get('content-type') ?? ''; if (!ct.includes('json') && r.status < 300 && r.status !== 204) return { status: r.status, headers: r.headers, buffer: Buffer.from(await r.arrayBuffer()) }; const x = await r.text(); return { status: r.status, body: x ? JSON.parse(x) : null }; };
const upload = async (p, t, buffer, name, type) => { const fd = new FormData(); fd.append('file', new Blob([buffer], { type }), name); const r = await fetch(B + p, { method: 'POST', headers: { Authorization: 'Bearer ' + t }, body: fd }); const ct = r.headers.get('content-type') ?? ''; if (!ct.includes('json')) return { status: r.status, buffer: Buffer.from(await r.arrayBuffer()) }; return { status: r.status, body: await r.json() }; };
const check = (l, r, s, c) => { const ok = r.status === s && (!c || r.body?.code === c); ok ? pass++ : fail++; console.log(`${ok ? '✔' : '✘'} ${l.padEnd(66)} ${r.status} ${r.body?.code ?? ''}${ok ? '' : ' ← esperado ' + s + ' ' + (c ?? '') + ' ' + JSON.stringify(r.body).slice(0, 300)}`); return r; };
const expect = (l, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? '✔' : '✘'} ${l}${extra ? '  ' + extra : ''}`); };
const login = async (email, password = 'Demo123!') => (await call('POST', '/auth/login', null, { email, password })).body;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const COLS = ['codigo', 'tipo_documento', 'numero_documento', 'nombres', 'apellidos', 'correo', 'telefono', 'fecha_nacimiento', 'fecha_ingreso', 'cargo', 'sede', 'tipo_contrato', 'salario', 'horas_semanales', 'fecha_fin_contrato', 'acceso_app'];

async function xlsxFile(rows) {
  const wb = new Workbook(); const ws = wb.addWorksheet('Empleados');
  ws.addRow(COLS); rows.forEach(r => ws.addRow(COLS.map(c => r[c] ?? null)));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

(async () => {
  const db = new Client({ connectionString: process.env.E2E_DATABASE_URL }); await db.connect();
  const q = async (s, p) => (await db.query(s, p)).rows;
  const [compB] = await q(`INSERT INTO companies (id,name,slug,status,"updatedAt") VALUES (gen_random_uuid(),'Empresa B','empresa-b','ACTIVE',now()) RETURNING id`);
  const [admRole] = await q(`SELECT id FROM roles WHERE code='COMPANY_ADMIN' AND "companyId" IS NULL`);
  const [uB] = await q(`INSERT INTO users (id,email,"passwordHash","firstName","lastName","updatedAt") VALUES (gen_random_uuid(),'admin@b.local',$1,'Beto','B',now()) RETURNING id`, [await hash('Demo123!')]);
  await db.query(`INSERT INTO company_memberships (id,"companyId","userId","roleId","updatedAt") VALUES (gen_random_uuid(),$1,$2,$3,now())`, [compB.id, uB.id, admRole.id]);

  const A = (await login('admin@demo.local')).accessToken;
  const sup = (await call('GET', '/roles', A)).body.find(r => r.code === 'SUPERVISOR');
  await call('POST', '/users', A, { email: 'laura@demo.local', firstName: 'Laura', lastName: 'Sup', password: 'Demo123!', roleId: sup.id });
  await db.query(`UPDATE users SET "mustChangePassword"=false`);
  const L = (await login('laura@demo.local')).accessToken, TB = (await login('admin@b.local')).accessToken;
  const [carlos] = await q(`SELECT id FROM employees WHERE code='EMP-001'`);

  console.log('— Contratos');
  const c0 = check('Historial de contratos de Carlos', await call('GET', `/employees/${carlos.id}/contracts`, A), 200).body;
  console.log(`     ${c0.map(c => `${c.contractType} desde ${c.startDate} · $${c.baseSalary} · ${c.weeklyHours} h · vigente=${c.current}`).join(' | ')}`);
  const raise = check('Aumento de salario desde 2026-07-01', await call('POST', `/employees/${carlos.id}/contracts`, A, { contractType: 'INDEFINITE', startDate: '2026-07-01', baseSalary: '2300000', weeklyHours: 42 }), 201).body;
  console.log(`     cerró el anterior: ${JSON.stringify(raise.closedPrevious)}`);
  const c1 = (await call('GET', `/employees/${carlos.id}/contracts`, A)).body;
  expect('     historial: 2 contratos, el nuevo es el vigente', c1.length === 2 && c1.find(c => c.current)?.baseSalary === '2300000.00' && c1.find(c => !c.current)?.endDate === '2026-06-30');
  check('Contrato que pisa la historia (desde 2026-03-01)', await call('POST', `/employees/${carlos.id}/contracts`, A, { contractType: 'INDEFINITE', startDate: '2026-03-01', baseSalary: '2100000', weeklyHours: 42 }), 409, 'CONTRACT_OVERLAP');
  check('Término fijo sin fecha de fin', await call('POST', `/employees/${carlos.id}/contracts`, A, { contractType: 'FIXED_TERM', startDate: '2026-12-01', baseSalary: '2400000', weeklyHours: 42 }), 400, 'INVALID_CONTRACT');
  check('Salario con formato de texto "2.400.000"', await call('POST', `/employees/${carlos.id}/contracts`, A, { contractType: 'INDEFINITE', startDate: '2026-12-01', baseSalary: '2.400.000', weeklyHours: 42 }), 400, 'VALIDATION_ERROR');
  const old = c1.find(c => !c.current);
  check('Extender el contrato viejo sobre el nuevo', await call('PATCH', `/employees/${carlos.id}/contracts/${old.id}`, A, { endDate: '2026-08-31' }), 400, 'INVALID_CONTRACT');
  check('Agregar una nota al contrato viejo', await call('PATCH', `/employees/${carlos.id}/contracts/${old.id}`, A, { notes: 'Ajuste anual' }), 200);
  const ana = (await call('POST', '/employees', A, { code: 'E-ANA', documentType: 'CC', documentNumber: '111222', firstName: 'Ana', lastName: 'Fija', hireDate: '2026-02-01' })).body.id;
  const fixed = check('Contrato a término fijo hasta 2026-12-31 (46 h)', await call('POST', `/employees/${ana}/contracts`, A, { contractType: 'FIXED_TERM', startDate: '2026-02-01', endDate: '2026-12-31', baseSalary: '1800000.50', weeklyHours: 46 }), 201).body;
  expect(`     aviso de jornada: "${fixed.warnings?.[0]?.slice(0, 70)}…"`, fixed.warnings?.length === 1);
  await call('PATCH', `/employees/${ana}/status`, A, { status: 'TERMINATED', terminationDate: '2026-09-15' });
  const fc = (await call('GET', `/employees/${ana}/contracts`, A)).body[0];
  expect(`El retiro cerró el contrato fijo en la fecha de retiro (${fc.endDate})`, fc.endDate === '2026-09-15');
  check('Supervisora (sin permiso de salarios) consulta contratos', await call('GET', `/employees/${carlos.id}/contracts`, L), 403, 'FORBIDDEN');
  check('Empresa B consulta contratos de A', await call('GET', `/employees/${carlos.id}/contracts`, TB), 404, 'EMPLOYEE_NOT_FOUND');

  console.log('— Plantilla');
  const tpl = check('Descargar plantilla Excel', await call('GET', '/employees/import/template?format=xlsx', A), 200);
  const twb = new Workbook(); await twb.xlsx.load(tpl.buffer);
  const headers = twb.worksheets[0].getRow(1).values.slice(1);
  console.log(`     hojas: ${twb.worksheets.map(w => w.name).join(', ')} · columnas: ${headers.length}`);
  expect('     encabezados de la plantilla', COLS.every(c => headers.includes(c)));

  console.log('— Validación (simulacro) de un Excel con errores');
  const good = [
    { codigo: 'IMP-001', tipo_documento: 'CC', numero_documento: '90000001', nombres: 'Lucía', apellidos: 'Gómez', fecha_ingreso: new Date(Date.UTC(2026, 8, 1)), cargo: 'Cajero', sede: 'CENTRO', tipo_contrato: 'INDEFINIDO', salario: 1750905, horas_semanales: 42 },
    { codigo: 'IMP-002', tipo_documento: 'CE', numero_documento: '90000002', nombres: 'Jorge', apellidos: 'Díaz', correo: 'jorge@demo.local', fecha_ingreso: '2026-09-01', acceso_app: 'SI' },
    { codigo: 'IMP-003', tipo_documento: 'PASAPORTE', numero_documento: 'AB12345', nombres: 'Mía', apellidos: 'Ruiz', fecha_ingreso: '15/09/2026' },
  ];
  const bad = [
    { codigo: 'IMP-001', tipo_documento: 'CC', numero_documento: '90000009', nombres: 'Duplicado', apellidos: 'En archivo', fecha_ingreso: '2026-09-01' },
    { codigo: 'EMP-001', tipo_documento: 'CC', numero_documento: '90000010', nombres: 'Ya', apellidos: 'Existe', fecha_ingreso: '2026-09-01' },
    { codigo: 'IMP-010', tipo_documento: 'CC', numero_documento: '90000011', nombres: 'Fecha', apellidos: 'Mala', fecha_ingreso: '31/02/2026' },
    { codigo: 'IMP-011', tipo_documento: 'CC', numero_documento: '90000012', nombres: 'Sede', apellidos: 'Rara', fecha_ingreso: '2026-09-01', sede: 'MARTE' },
    { codigo: 'IMP-012', tipo_documento: 'CC', numero_documento: '90000013', nombres: 'Sin', apellidos: 'Correo', fecha_ingreso: '2026-09-01', acceso_app: 'SI' },
    { codigo: 'IMP-013', tipo_documento: 'CC', numero_documento: '90000014', nombres: 'Fijo', apellidos: 'Sin fin', fecha_ingreso: '2026-09-01', tipo_contrato: 'TERMINO FIJO', salario: 2000000, horas_semanales: 42 },
  ];
  const mixed = await xlsxFile([...good, ...bad]);
  const pv = check('Validar archivo con 3 filas buenas y 6 con errores', await upload('/employees/import/preview', A, mixed, 'empleados.xlsx', XLSX), 200).body;
  console.log(`     total ${pv.total} · válidas ${pv.valid} · con errores ${pv.invalid} · con contrato ${pv.withContract} · con acceso ${pv.withAppAccess}`);
  pv.errors.forEach(e => console.log(`       fila ${e.row} (${e.code}): ${e.errors.map(x => x.message ?? x).join('; ')}`));
  expect('     detectó los 6 problemas', pv.valid === 3 && pv.invalid === 6);
  const [{ n: before }] = await q(`SELECT count(*)::int n FROM employees`);
  check('Importar con errores (todo o nada)', await upload('/employees/import', A, mixed, 'empleados.xlsx', XLSX), 400, 'IMPORT_HAS_ERRORS');
  const [{ n: after }] = await q(`SELECT count(*)::int n FROM employees`);
  expect(`     no se guardó nada (${before} → ${after})`, before === after);
  const rep = check('Descargar el reporte de errores', await upload('/employees/import/preview/report', A, mixed, 'empleados.xlsx', XLSX), 200);
  const rwb = new Workbook(); await rwb.xlsx.load(rep.buffer);
  const rws = rwb.worksheets[0]; const rh = rws.getRow(1).values.slice(1);
  const errCol = rh.findIndex(h => String(h).toLowerCase().includes('error')) + 1;
  const withErr = []; rws.eachRow((row, n) => { if (n > 1 && row.getCell(errCol).value) withErr.push(n); });
  expect(`     el reporte marca ${withErr.length} filas con su error`, withErr.length === 6, `p. ej.: "${rws.getRow(withErr[2]).getCell(errCol).value}"`);

  console.log('— Importar un CSV como lo exporta Excel en Colombia');
  const csv = ['codigo;tipo_documento;numero_documento;nombres;apellidos;correo;telefono;fecha_nacimiento;fecha_ingreso;cargo;sede;tipo_contrato;salario;horas_semanales;fecha_fin_contrato;acceso_app',
    'CSV-001;CC;1.020.304.050;Andrés;Peña;andres@demo.local;3105551234;12/04/1995;01/09/2026;Cajero;CENTRO;Término indefinido;2.300.000;42;;SI',
    'CSV-002;CC;1020304051;Valentina;Muñoz;;;;01/09/2026;;;Término fijo;1.750.905,50;36;31/12/2026;NO',
    'CSV-003;TI;1020304052;Sebastián;Ortíz;admin@demo.local;;;15/09/2026;;CENTRO;;;;;SI'].join('\r\n');
  const latin1 = Buffer.from(csv, 'latin1'); // "CSV (delimitado por comas)" de Excel en español: Windows-1252
  const pcsv = check('Validar CSV en Windows-1252 separado por ";"', await upload('/employees/import/preview', A, latin1, 'empleados.csv', 'text/csv'), 200).body;
  console.log(`     válidas ${pcsv.valid} / ${pcsv.total}${pcsv.invalid ? ' · errores: ' + JSON.stringify(pcsv.errors) : ''}`);
  const imp = check('Importar', await upload('/employees/import', A, latin1, 'empleados.csv', 'text/csv'), 201).body;
  console.log(`     creados ${imp.created} · con contrato ${imp.withContract} · invitados ${imp.invited} · avisos: ${imp.warnings.length ? imp.warnings.join(' | ') : 'ninguno'}`);
  const rows = await q(`SELECT e.code, e."firstName", e."lastName", e."documentNumber", to_char(e."hireDate",'YYYY-MM-DD') h, c."baseSalary"::text s, c."contractType" t, to_char(c."endDate",'YYYY-MM-DD') fin, e."userId" IS NOT NULL acc FROM employees e LEFT JOIN employment_contracts c ON c."employeeId"=e.id WHERE e.code LIKE 'CSV-%' ORDER BY e.code`);
  rows.forEach(r => console.log(`       ${r.code} ${r.firstName} ${r.lastName} · doc ${r.documentNumber} · ingreso ${r.h} · ${r.t ?? 'sin contrato'} ${r.s ?? ''} ${r.fin ? 'hasta ' + r.fin : ''} · app: ${r.acc}`));
  expect('     tildes, ñ, puntos de miles, coma decimal y fechas dd/mm bien interpretados',
    rows[0].lastName === 'Peña' && rows[1].lastName === 'Muñoz' && rows[2].firstName === 'Sebastián' &&
    rows[0].documentNumber === '1020304050' && rows[0].s === '2300000.00' && rows[1].s === '1750905.50' &&
    rows[1].fin === '2026-12-31' && rows[0].h === '2026-09-01');
  expect('     el admin existente quedó vinculado como empleado (sin nueva cuenta)', rows[2].acc === true);
  await sleep(500);
  const log = fs.readFileSync(process.env.E2E_APP_LOG, 'utf8');
  const mail = log.split('──────── CORREO').filter(m => m.includes('Para: andres@demo.local')).at(-1) ?? '';
  const token = mail.match(/token=([A-Za-z0-9_-]{43})/)?.[1];
  expect(`     Andrés recibió: "${mail.match(/Asunto: (.*)/)?.[1]}"`, !!token);
  check('Andrés no puede entrar antes de crear su contraseña', await call('POST', '/auth/login', null, { email: 'andres@demo.local', password: 'cualquiera1' }), 401, 'INVALID_CREDENTIALS');
  check('Crea su contraseña con el enlace', await call('POST', '/auth/password/reset', null, { token, newPassword: 'Andres2026' }), 204);
  const al = await login('andres@demo.local', 'Andres2026');
  expect(`     entra a ${al.company?.name} como ${al.company?.role.name}`, al.company?.role.code === 'EMPLOYEE');
  const again = check('Volver a importar el mismo archivo', await upload('/employees/import/preview', A, latin1, 'empleados.csv', 'text/csv'), 200).body;
  expect(`     ahora todas las filas son duplicadas (${again.invalid}/${again.total})`, again.invalid === 3);

  console.log('— Archivos inválidos, permisos y aislamiento');
  check('Archivo que no es Excel ni CSV (PDF)', await upload('/employees/import/preview', A, Buffer.from('%PDF-1.4 ...'), 'x.pdf', 'application/pdf'), 400, 'IMPORT_FILE_INVALID');
  check('Excel sin las columnas obligatorias', await upload('/employees/import/preview', A, await (async () => { const wb = new Workbook(); wb.addWorksheet('X').addRow(['nombre', 'edad']); return Buffer.from(await wb.xlsx.writeBuffer()); })(), 'x.xlsx', XLSX), 400, 'IMPORT_FILE_INVALID');
  check('Supervisora intenta importar', await upload('/employees/import/preview', L, mixed, 'e.xlsx', XLSX), 403, 'FORBIDDEN');
  const [custom] = await q(`INSERT INTO roles (id,"companyId",code,name,"updatedAt") SELECT gen_random_uuid(),id,'RRHH_SIN_SALARIOS','RRHH sin salarios',now() FROM companies WHERE slug='demo' RETURNING id`);
  await q(`INSERT INTO role_permissions ("roleId","permissionId") SELECT $1,id FROM permissions WHERE code IN ('employees.read','employees.manage','users.manage')`, [custom.id]);
  await call('POST', '/users', A, { email: 'rrhh@demo.local', firstName: 'Rita', lastName: 'RRHH', password: 'Demo123!', roleId: custom.id });
  await db.query(`UPDATE users SET "mustChangePassword"=false WHERE email='rrhh@demo.local'`);
  await sleep(RATE_PAUSE); console.log('   (pausa por el límite de logins)');
  const R = (await login('rrhh@demo.local')).accessToken;
  const onlyGood = await xlsxFile(good);
  check('Rol sin contracts.manage importa filas con salario', await upload('/employees/import', R, onlyGood, 'e.xlsx', XLSX), 403, 'IMPORT_CONTRACTS_FORBIDDEN');
  const bp = check('Empresa B valida filas con la sede CENTRO de A', await upload('/employees/import/preview', TB, onlyGood, 'e.xlsx', XLSX), 200).body;
  expect(`     la sede de A no existe para B (${bp.invalid} fila con error)`, bp.invalid === 1 && JSON.stringify(bp.errors).toLowerCase().includes('sede'));
  const [aud] = await q(`SELECT after FROM audit_logs WHERE action='employee.imported' ORDER BY "createdAt" DESC LIMIT 1`);
  expect(`Auditoría de la importación: ${JSON.stringify(aud.after)}`, aud.after.created === 3);
  await db.end(); console.log(`\n${pass} OK, ${fail} fallos`);
})().catch(e => { console.error(e); process.exit(1); });
