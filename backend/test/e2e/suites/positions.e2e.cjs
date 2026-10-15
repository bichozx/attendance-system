// Prueba de punta a punta: positions (cargos) y edición de empleados. Se ejecuta con test/e2e/run.mjs.
const { Client } = require('pg');
const B = (process.env.E2E_BASE_URL ?? 'http://localhost:3999') + '/api/v1';
// La genera test/e2e/run.mjs para cada suite (el seed la usa para el superadmin)
const SA_PASSWORD = process.env.E2E_PLATFORM_ADMIN_PASSWORD;
let pass = 0, fail = 0;
const call = async (m, p, t, b) => { const r = await fetch(B + p, { method: m, headers: { 'Content-Type': 'application/json', ...(t && { Authorization: 'Bearer ' + t }) }, body: b && JSON.stringify(b) }); const x = await r.text(); return { status: r.status, body: x ? JSON.parse(x) : null }; };
const check = (l, r, s, c) => { const ok = r.status === s && (!c || r.body?.code === c); ok ? pass++ : fail++; console.log(`${ok ? '✔' : '✘'} ${l.padEnd(66)} ${r.status} ${r.body?.code ?? ''}${ok ? '' : ' ← esperado ' + s + ' ' + (c ?? '') + ' ' + JSON.stringify(r.body).slice(0, 300)}`); return r; };
const expect = (l, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? '✔' : '✘'} ${l}${extra ? '  ' + extra : ''}`); };
const login = async (email, password = 'Demo123!') => (await call('POST', '/auth/login', null, { email, password })).body;
const DEFAULTS = ['Bar', 'Caja', 'Cocina', 'Host', 'Líder', 'Servicio', 'Supernumeraria de servicio'];

(async () => {
  const db = new Client({ connectionString: process.env.E2E_DATABASE_URL }); await db.connect();
  const A = (await login('admin@demo.local')).accessToken;
  const E = (await login('empleado@demo.local')).accessToken;

  console.log('— Cargos predeterminados');
  const list = check('Listar cargos', await call('GET', '/positions', A), 200).body;
  expect(`     la empresa trae los cargos de restaurante (${list.map((p) => p.name).join(', ')})`, JSON.stringify(list.map((p) => p.name)) === JSON.stringify(DEFAULTS));
  expect('     cada cargo trae cuántas personas lo tienen', list.every((p) => typeof p.employeeCount === 'number'));
  const byName = Object.fromEntries(list.map((p) => [p.name, p]));

  console.log('— Crear y editar cargos');
  const steward = check('Crear "Steward"', await call('POST', '/positions', A, { name: '  Steward ', description: 'Lavado y menaje' }), 201).body;
  expect('     sin espacios sobrantes y con 0 personas', steward.name === 'Steward' && steward.employeeCount === 0);
  check('Nombre repetido (sin importar mayúsculas)', await call('POST', '/positions', A, { name: 'cocina' }), 409, 'POSITION_NAME_TAKEN');
  check('Nombre de una letra', await call('POST', '/positions', A, { name: 'X' }), 400);
  check('Un empleado no puede crear cargos', await call('POST', '/positions', E, { name: 'Jefe' }), 403, 'FORBIDDEN');
  check('Renombrar "Steward" → "Steward de cocina"', await call('PATCH', `/positions/${steward.id}`, A, { name: 'Steward de cocina' }), 200);
  check('Renombrar a un nombre que ya existe', await call('PATCH', `/positions/${steward.id}`, A, { name: 'Bar' }), 409, 'POSITION_NAME_TAKEN');

  console.log('— Editar un empleado');
  const emp = check('Registrar a Ana en Cocina', await call('POST', '/employees', A, { code: 'E-ANA', documentType: 'CC', documentNumber: '1001', firstName: 'Ana', lastName: 'Ruiz', hireDate: '2026-01-10', positionId: byName.Cocina.id }), 201).body;
  expect('     queda con el cargo Cocina', emp.position?.name === 'Cocina');
  const upd = check('Editar nombre, documento, teléfono y cargo', await call('PATCH', `/employees/${emp.id}`, A, { firstName: 'Ana María', documentNumber: '1002', phone: '3001234567', positionId: byName.Bar.id }), 200).body;
  expect('     se guardan los cambios', upd.firstName === 'Ana María' && upd.documentNumber === '1002' && upd.phone === '3001234567' && upd.position?.name === 'Bar');
  const audit = (await db.query(`SELECT before->'position'->>'name' b, after->'position'->>'name' a FROM audit_logs WHERE action='employee.updated' AND "entityId"=$1`, [emp.id])).rows[0];
  expect('     la auditoría registra el cambio de cargo (Cocina → Bar)', audit?.b === 'Cocina' && audit?.a === 'Bar', JSON.stringify(audit));
  check('Quitar el cargo', await call('PATCH', `/employees/${emp.id}`, A, { positionId: null }), 200);
  check('Cargo de otra empresa (o inexistente)', await call('PATCH', `/employees/${emp.id}`, A, { positionId: '00000000-0000-7000-8000-000000000000' }), 400, 'INVALID_REFERENCE');
  check('Un empleado no puede editar empleados', await call('PATCH', `/employees/${emp.id}`, E, { firstName: 'Hack' }), 403, 'FORBIDDEN');

  console.log('— Desactivar un cargo');
  await call('PATCH', `/employees/${emp.id}`, A, { positionId: byName.Host.id });
  const hostCount = (await call('GET', '/positions', A)).body.find((p) => p.name === 'Host').employeeCount;
  expect('     Host cuenta 1 persona', hostCount === 1, String(hostCount));
  check('Desactivar "Host"', await call('PATCH', `/positions/${byName.Host.id}`, A, { isActive: false }), 200);
  expect('     ya no sale en la lista para asignar', !(await call('GET', '/positions', A)).body.some((p) => p.name === 'Host'));
  expect('     …pero sí con includeInactive', (await call('GET', '/positions?includeInactive=true', A)).body.some((p) => p.name === 'Host' && !p.isActive));
  check('Ana conserva su cargo y se puede editar sin cambiarlo', await call('PATCH', `/employees/${emp.id}`, A, { lastName: 'Ruiz Gómez', positionId: byName.Host.id }), 200);
  const other = (await call('POST', '/employees', A, { code: 'E-LUIS', documentType: 'CC', documentNumber: '2001', firstName: 'Luis', lastName: 'Mora', hireDate: '2026-02-01' })).body;
  check('A otra persona no se le asigna un cargo desactivado', await call('PATCH', `/employees/${other.id}`, A, { positionId: byName.Host.id }), 409, 'POSITION_INACTIVE');
  check('…ni al registrarla', await call('POST', '/employees', A, { code: 'E-PEDRO', documentType: 'CC', documentNumber: '3001', firstName: 'Pedro', lastName: 'Gil', hireDate: '2026-02-01', positionId: byName.Host.id }), 409, 'POSITION_INACTIVE');
  check('Reactivar "Host"', await call('PATCH', `/positions/${byName.Host.id}`, A, { isActive: true }), 200);
  check('Ahora sí se asigna', await call('PATCH', `/employees/${other.id}`, A, { positionId: byName.Host.id }), 200);

  console.log('— Filtrar por cargo');
  const filtered = check('Empleados con cargo Host', await call('GET', `/employees?positionId=${byName.Host.id}`, A), 200).body;
  expect('     Ana y Luis', filtered.total === 2, String(filtered.total));

  console.log('— Empresa nueva');
  const SA = (await login('superadmin@asistencia.local', SA_PASSWORD)).accessToken;
  const co = check('Superadmin crea una empresa', await call('POST', '/platform/companies', SA, { name: 'Restaurante Prueba', admin: { email: 'admin@restprueba.co', firstName: 'Rita', lastName: 'Prueba' } }), 201).body;
  const names = (await db.query(`SELECT name FROM positions WHERE "companyId"=$1 ORDER BY name`, [co.company?.id ?? co.id])).rows.map((r) => r.name);
  expect(`     arranca con los 7 cargos (${names.join(', ')})`, JSON.stringify(names) === JSON.stringify(DEFAULTS));

  await db.end(); console.log(`\n${pass} OK, ${fail} fallos`);
})().catch((e) => { console.error(e); process.exit(1); });
