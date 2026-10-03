// Prueba de punta a punta: companies. Se ejecuta con test/e2e/run.mjs (ver README).
const fs = require('fs');
const { Client } = require('pg');
const B = (process.env.E2E_BASE_URL ?? 'http://localhost:3999') + '/api/v1';
let pass = 0, fail = 0;
// El ejecutor sube el límite de logins para las pruebas; sin él, hay que esperar el minuto
const RATE_PAUSE = Number(process.env.E2E_RATE_PAUSE_MS ?? 61_000);
const call = async (m, p, t, b) => { const r = await fetch(B + p, { method: m, headers: { 'Content-Type': 'application/json', ...(t && { Authorization: 'Bearer ' + t }) }, body: b && JSON.stringify(b) }); const x = await r.text(); return { status: r.status, body: x ? JSON.parse(x) : null }; };
const check = (l, r, s, c) => { const ok = r.status === s && (!c || r.body?.code === c); ok ? pass++ : fail++; console.log(`${ok ? '✔' : '✘'} ${l.padEnd(66)} ${r.status} ${r.body?.code ?? ''}${ok ? '' : ' ← esperado ' + s + ' ' + (c ?? '') + ' ' + JSON.stringify(r.body).slice(0, 250)}`); return r; };
const expect = (l, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? '✔' : '✘'} ${l}${extra ? '  ' + extra : ''}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const login = (email, password = 'Demo123!', companyId) => call('POST', '/auth/login', null, { email, password, companyId });
const lastMailTo = async (to) => { await sleep(400); return fs.readFileSync(process.env.E2E_APP_LOG, 'utf8').split('──────── CORREO').slice(1).filter(m => m.includes(`Para: ${to}`)).at(-1) ?? ''; };
const pause = async () => { console.log('   (pausa por el límite de logins por IP)'); await sleep(RATE_PAUSE); };
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
const day = (n) => { const d = new Date(today + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

(async () => {
  const db = new Client({ connectionString: process.env.E2E_DATABASE_URL }); await db.connect();
  const q = async (s, p) => (await db.query(s, p)).rows;

  console.log('— Acceso a la plataforma');
  const SA = check('Superadmin inicia sesión (sin empresa)', await login('superadmin@asistencia.local', 'Cambiar123!'), 200).body.accessToken;
  const A = (await login('admin@demo.local')).body.accessToken;
  const E = (await login('empleado@demo.local')).body.accessToken;
  check('Admin de empresa (con TODOS los permisos) entra a /platform', await call('GET', '/platform/companies', A), 403, 'FORBIDDEN');
  check('Empleado entra a /platform', await call('GET', '/platform/companies', E), 403, 'FORBIDDEN');
  const list0 = check('Superadmin lista empresas', await call('GET', '/platform/companies', SA), 200);
  console.log(`     ${list0.body.items.map(c => `${c.name} (${c.status}): ${c.stats.activeEmployees} empleados, ${c.stats.stores} tienda`).join(' | ')}`);
  check('Superadmin intenta usar endpoints de empresa (no tiene empresa)', await call('GET', '/company', SA), 403);

  console.log('— Alta de un cliente nuevo');
  const rosaCo = check('Alta "Panadería Doña Rosa" con su admin', await call('POST', '/platform/companies', SA, { name: 'Panadería Doña Rosa', legalName: 'Panadería Doña Rosa S.A.S.', taxId: '900123456-7', admin: { email: 'Rosa@PanaderiaRosa.com', firstName: 'Rosa', lastName: 'Martínez' } }), 201).body;
  console.log(`     slug "${rosaCo.slug}" · estado ${rosaCo.status} · zona ${rosaCo.timezone} · admin ${rosaCo.admins[0].email} (ya entró: ${rosaCo.admins[0].hasLoggedIn})`);
  const invite = await lastMailTo('rosa@panaderiarosa.com');
  const token = invite.match(/token=([A-Za-z0-9_-]{43})/)?.[1];
  expect(`     correo de bienvenida: "${invite.match(/Asunto: (.*)/)?.[1]}"`, !!token);
  const dup = check('Otra empresa con el mismo nombre (slug automático distinto)', await call('POST', '/platform/companies', SA, { name: 'Panadería Doña Rosa', admin: { email: 'otra@rosa.com', firstName: 'Otra', lastName: 'Rosa' } }), 201);
  console.log(`     slug "${dup.body.slug}"`);
  check('NIT repetido en el mismo país', await call('POST', '/platform/companies', SA, { name: 'Copia', taxId: '900123456-7', admin: { email: 'x@x.com', firstName: 'X', lastName: 'Y' } }), 409, 'COMPANY_TAX_ID_TAKEN');
  check('Zona horaria inválida', await call('POST', '/platform/companies', SA, { name: 'Mala', timezone: 'Bogota', admin: { email: 'x@x.com', firstName: 'X', lastName: 'Y' } }), 400, 'INVALID_COMPANY_SETTINGS');
  check('Slug con mayúsculas', await call('POST', '/platform/companies', SA, { name: 'Mala', slug: 'Con Espacios', admin: { email: 'x@x.com', firstName: 'X', lastName: 'Y' } }), 400, 'INVALID_COMPANY_SETTINGS');
  await pause();

  console.log('— La nueva administradora activa su cuenta');
  check('Rosa intenta entrar sin haber creado contraseña', await login('rosa@panaderiarosa.com', 'Adivinando1'), 401, 'INVALID_CREDENTIALS');
  check('Crea su contraseña con el enlace de bienvenida', await call('POST', '/auth/password/reset', null, { token, newPassword: 'PanRosa2026' }), 204);
  const rosaLogin = check('Rosa entra', await login('rosa@panaderiarosa.com', 'PanRosa2026'), 200).body;
  const R = rosaLogin.accessToken;
  console.log(`     empresa: ${rosaLogin.company.name} · rol: ${rosaLogin.company.role.name} · contraseña temporal: ${rosaLogin.user.mustChangePassword}`);
  expect('     Rosa no ve nada de Empresa Demo', (await call('GET', '/employees', R)).body.total === 0 && (await call('GET', '/stores', R)).body.total === 0);

  console.log('— Cuenta existente: el admin de Demo también administrará otra empresa');
  check('Alta "Tiendas Norte" con admin@demo.local (cuenta existente)', await call('POST', '/platform/companies', SA, { name: 'Tiendas Norte', status: 'ACTIVE', admin: { email: 'admin@demo.local', firstName: 'Ignorado', lastName: 'Ignorado' } }), 201);
  expect('     recibe aviso de acceso, no invitación', (await lastMailTo('admin@demo.local')).includes('Ahora tienes acceso a Tiendas Norte'));
  const sel = check('Ahora debe elegir empresa al entrar', await login('admin@demo.local'), 409, 'COMPANY_SELECTION_REQUIRED');
  console.log(`     opciones: ${sel.body.details.companies.map(c => c.name).join(', ')}`);

  console.log('— Configuración de la empresa por su admin');
  const co = check('Rosa consulta su empresa', await call('GET', '/company', R), 200);
  console.log(`     valores por defecto de turnos: ${JSON.stringify(co.body.shiftDefaults)}`);
  const upd = check('Define su política: marca 10 min antes, 5 de tolerancia, 30 de descanso', await call('PATCH', '/company', R, { shiftDefaults: { earlyClockInMinutes: 10, lateToleranceMinutes: 5, breakMinutes: 30 } }), 200);
  check('Intenta cambiar su NIT (solo plataforma)', await call('PATCH', '/company', R, { taxId: '111' }), 400, 'VALIDATION_ERROR');
  check('Tolerancia fuera de rango', await call('PATCH', '/company', R, { shiftDefaults: { lateToleranceMinutes: 500 } }), 400, 'VALIDATION_ERROR');
  check('Zona horaria inválida', await call('PATCH', '/company', R, { timezone: 'Marte/Base' }), 400, 'INVALID_COMPANY_SETTINGS');
  check('Empleado de Demo intenta cambiar su empresa', await call('PATCH', '/company', E, { name: 'Hackeada' }), 403, 'FORBIDDEN');

  const store = (await call('POST', '/stores', R, { code: 'PPAL', name: 'Sede principal', latitude: 4.65, longitude: -74.06 })).body;
  const emp = (await call('POST', '/employees', R, { code: 'P-001', documentType: 'CC', documentNumber: '5555', firstName: 'Luis', lastName: 'Panadero', hireDate: '2026-01-01' })).body;
  const sh = check('Turno sin indicar minutos → usa la política de la empresa', await call('POST', '/shifts', R, { storeId: store.id, date: day(2), startTime: '05:00', endTime: '13:00', employeeIds: [emp.id] }), 201).body;
  expect(`     anticipación ${sh.earlyClockInMinutes} · tolerancia ${sh.lateToleranceMinutes} · descanso ${sh.breakMinutes}`, sh.earlyClockInMinutes === 10 && sh.lateToleranceMinutes === 5 && sh.breakMinutes === 30);
  const sh2 = (await call('POST', '/shifts', R, { storeId: store.id, date: day(3), startTime: '05:00', endTime: '13:00', earlyClockInMinutes: 0 })).body;
  expect('     un turno puede sobrescribirla (anticipación 0)', sh2.earlyClockInMinutes === 0 && sh2.lateToleranceMinutes === 5);
  await pause();

  console.log('— Suspensión por falta de pago');
  const rosaRefresh = rosaLogin.refreshToken;
  const sus = check('Superadmin suspende la panadería', await call('PATCH', `/platform/companies/${rosaCo.id}/status`, SA, { status: 'SUSPENDED', reason: 'Factura vencida' }), 200);
  console.log(`     estado ${sus.body.status}`);
  check('La sesión de Rosa ya no se puede renovar', await call('POST', '/auth/refresh', null, { refreshToken: rosaRefresh }), 401, 'INVALID_REFRESH_TOKEN');
  check('Rosa no puede volver a entrar', await login('rosa@panaderiarosa.com', 'PanRosa2026'), 403, 'NO_ACTIVE_COMPANY');
  const [{ n: kept }] = await q(`SELECT count(*)::int n FROM shifts WHERE "companyId"=$1`, [rosaCo.id]);
  expect(`     sus datos siguen intactos (${kept} turnos)`, kept === 2);
  const sel2 = check('Admin de Demo: Tiendas Norte y Demo siguen disponibles', await login('admin@demo.local'), 409, 'COMPANY_SELECTION_REQUIRED');
  expect('     (la suspendida no aparece en sus opciones)', !sel2.body.details.companies.some(c => c.id === rosaCo.id));
  check('Superadmin reactiva', await call('PATCH', `/platform/companies/${rosaCo.id}/status`, SA, { status: 'ACTIVE' }), 200);
  check('Rosa vuelve a entrar', await login('rosa@panaderiarosa.com', 'PanRosa2026'), 200);

  console.log('— Soporte del superadmin');
  check('Corregir el NIT', await call('PATCH', `/platform/companies/${rosaCo.id}`, SA, { taxId: '900123456-8' }), 200);
  check('Slug que ya usa otra empresa', await call('PATCH', `/platform/companies/${rosaCo.id}`, SA, { slug: 'demo' }), 409, 'COMPANY_SLUG_TAKEN');
  check('Reenviar invitación al admin de la otra panadería', await call('POST', `/platform/companies/${dup.body.id}/admins/${dup.body.admins[0].userId}/invitation`, SA), 202);
  check('Reenviar invitación a alguien que no es admin de esa empresa', await call('POST', `/platform/companies/${dup.body.id}/admins/${rosaCo.admins[0].userId}/invitation`, SA), 404, 'COMPANY_ADMIN_NOT_FOUND');
  const det = check('Detalle de la panadería', await call('GET', `/platform/companies/${rosaCo.id}`, SA), 200);
  console.log(`     ${JSON.stringify(det.body.stats)} · admin ya entró: ${det.body.admins[0].hasLoggedIn}`);
  const search = check('Buscar "panaderia"', await call('GET', '/platform/companies?search=panaderia', SA), 200);
  console.log(`     ${search.body.total} resultados`);
  const actions = (await q(`SELECT DISTINCT action FROM audit_logs WHERE "entityType"='Company' ORDER BY 1`)).map(r => r.action);
  expect(`Auditoría: ${actions.join(', ')}`, actions.length === 5);
  await db.end(); console.log(`\n${pass} OK, ${fail} fallos`);
})().catch(e => { console.error(e); process.exit(1); });
