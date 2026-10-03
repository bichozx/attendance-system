// Prueba de punta a punta: stores. Se ejecuta con test/e2e/run.mjs (ver README).
const { Client } = require('pg');
const { hash } = require('@node-rs/argon2');
const B = (process.env.E2E_BASE_URL ?? 'http://localhost:3999') + '/api/v1';
let pass = 0, fail = 0;
const call = async (m, p, t, b) => { const r = await fetch(B + p, { method: m, headers: { 'Content-Type': 'application/json', ...(t && { Authorization: 'Bearer ' + t }) }, body: b && JSON.stringify(b) }); const x = await r.text(); return { status: r.status, body: x ? JSON.parse(x) : null }; };
const check = (l, r, s, c) => { const ok = r.status === s && (!c || r.body?.code === c || r.body?.rejection === c); ok ? pass++ : fail++; console.log(`${ok ? '✔' : '✘'} ${l.padEnd(60)} ${r.status}${r.body?.code ? ' ' + r.body.code : ''}${r.body?.rejection ? ' ' + r.body.rejection : ''}${ok ? '' : ' ← esperado ' + s + ' ' + (c ?? '') + ' ' + JSON.stringify(r.body).slice(0, 220)}`); return r; };
const login = async (e) => (await call('POST', '/auth/login', null, { email: e, password: 'Demo123!' })).body.accessToken;
const north = (lat, lon, m) => ({ latitude: lat + m / 111195, longitude: lon });

(async () => {
  const db = new Client({ connectionString: process.env.E2E_DATABASE_URL }); await db.connect();
  const q = async (s, p) => (await db.query(s, p)).rows[0];
  const compB = await q(`INSERT INTO companies (id,name,slug,status,"updatedAt") VALUES (gen_random_uuid(),'Empresa B','empresa-b','ACTIVE',now()) RETURNING id`);
  const admRole = await q(`SELECT id FROM roles WHERE code='COMPANY_ADMIN' AND "companyId" IS NULL`);
  const uB = await q(`INSERT INTO users (id,email,"passwordHash","firstName","lastName","updatedAt") VALUES (gen_random_uuid(),'admin@b.local',$1,'Beto','B',now()) RETURNING id`, [await hash('Demo123!')]);
  await db.query(`INSERT INTO company_memberships (id,"companyId","userId","roleId","updatedAt") VALUES (gen_random_uuid(),$1,$2,$3,now())`, [compB.id, uB.id, admRole.id]);
  const A = await login('admin@demo.local'), TB = await login('admin@b.local'), E = await login('empleado@demo.local');

  console.log('— Establecimientos');
  const list = check('Listar establecimientos (seed)', await call('GET', '/stores', A), 200);
  console.log('    ', list.body.items.map(s => `${s.code}: ${s.activeGeofences} geocerca(s) activa(s)`).join(' | '));
  const base = { code: 'norte', name: 'Tienda Norte', address: 'Calle 100 # 15-20', city: 'Bogotá', latitude: 4.6867, longitude: -74.0468 };
  check('Zona horaria inválida', await call('POST', '/stores', A, { ...base, timezone: 'Bogota/Colombia' }), 400, 'INVALID_TIMEZONE');
  check('Latitud fuera de rango (95)', await call('POST', '/stores', A, { ...base, latitude: 95 }), 400, 'VALIDATION_ERROR');
  check('Radio menor al mínimo (10 m)', await call('POST', '/stores', A, { ...base, geofenceRadiusMeters: 10 }), 400, 'VALIDATION_ERROR');
  const st = check('Crear establecimiento con geocerca de 120 m', await call('POST', '/stores', A, { ...base, timezone: 'America/Bogota', geofenceRadiusMeters: 120 }), 201);
  const g1 = st.body.geofences[0];
  console.log(`     código ${st.body.code} | geocerca "${g1.name}" radio ${g1.radiusMeters} m, precisión máx ${g1.maxAccuracyMeters} m`);
  check('Código repetido', await call('POST', '/stores', A, { ...base }), 409, 'STORE_CODE_TAKEN');
  const f = check('Filtrar ?search=norte&isActive=true', await call('GET', '/stores?search=norte&isActive=true', A), 200);
  console.log('     total:', f.body.total);
  check('isActive=quizas', await call('GET', '/stores?isActive=quizas', A), 400, 'VALIDATION_ERROR');

  console.log('— Verificación de ubicación');
  const S = st.body.id, L = (m, acc) => ({ ...north(base.latitude, base.longitude, m), accuracyMeters: acc });
  let r = check('A 60 m, precisión 10 m → aceptada', await call('POST', `/stores/${S}/location-check`, A, L(60, 10)), 200);
  console.log('     accepted:', r.body.accepted, '| distancia calculada:', r.body.distanceMeters, 'm');
  check('A 200 m → fuera', await call('POST', `/stores/${S}/location-check`, A, L(200, 10)), 200, 'OUTSIDE_GEOFENCE');
  check('A 10 m pero precisión 80 m → GPS impreciso', await call('POST', `/stores/${S}/location-check`, A, L(10, 80)), 200, 'LOW_GPS_ACCURACY');

  console.log('— Geocercas');
  check('Centro con lat/lon invertidas', await call('POST', `/stores/${S}/geofences`, A, { name: 'Error', centerLatitude: base.longitude, centerLongitude: base.latitude, radiusMeters: 50 }), 400, 'GEOFENCE_TOO_FAR');
  check('Solo latitud', await call('POST', `/stores/${S}/geofences`, A, { name: 'Error', centerLatitude: base.latitude, radiusMeters: 50 }), 400, 'INCOMPLETE_COORDINATES');
  check('Centro null', await call('POST', `/stores/${S}/geofences`, A, { name: 'Error', centerLatitude: null, centerLongitude: null, radiusMeters: 50 }), 400, 'VALIDATION_ERROR');
  const p = north(base.latitude, base.longitude, 300);
  const g2 = check('Agregar geocerca del parqueadero (300 m al norte)', await call('POST', `/stores/${S}/geofences`, A, { name: 'Parqueadero', centerLatitude: p.latitude, centerLongitude: p.longitude, radiusMeters: 50 }), 201).body;
  r = check('A 320 m → aceptada por el parqueadero', await call('POST', `/stores/${S}/location-check`, A, L(320, 10)), 200);
  console.log('     geocerca usada:', r.body.geofenceId === g2.id ? 'Parqueadero ✓' : r.body.geofenceId);
  check('Desactivar el perímetro (queda el parqueadero)', await call('PATCH', `/stores/${S}/geofences/${g1.id}`, A, { isActive: false }), 200);
  check('Desactivar la última geocerca activa', await call('PATCH', `/stores/${S}/geofences/${g2.id}`, A, { isActive: false }), 409, 'LAST_ACTIVE_GEOFENCE');
  check('Eliminar la última geocerca activa', await call('DELETE', `/stores/${S}/geofences/${g2.id}`, A), 409, 'LAST_ACTIVE_GEOFENCE');
  check('Reactivar el perímetro', await call('PATCH', `/stores/${S}/geofences/${g1.id}`, A, { isActive: true }), 200);
  const emp = await q(`SELECT id FROM employees LIMIT 1`);
  await db.query(`INSERT INTO attendance_events (id,"companyId","employeeId",type,result,"geofenceId") SELECT gen_random_uuid(),"companyId",$1,'CLOCK_IN','ACCEPTED',$2 FROM geofences WHERE id=$2`, [emp.id, g2.id]);
  check('Eliminar geocerca con marcaciones', await call('DELETE', `/stores/${S}/geofences/${g2.id}`, A), 409, 'GEOFENCE_IN_USE');
  check('Desactivarla sí se permite', await call('PATCH', `/stores/${S}/geofences/${g2.id}`, A, { isActive: false }), 200);
  const g3 = (await call('POST', `/stores/${S}/geofences`, A, { name: 'Temporal', radiusMeters: 30 })).body;
  check('Eliminar geocerca sin marcaciones', await call('DELETE', `/stores/${S}/geofences/${g3.id}`, A), 204);

  console.log('— Aislamiento y permisos');
  check('Empresa B lee establecimiento de A', await call('GET', `/stores/${S}`, TB), 404, 'STORE_NOT_FOUND');
  check('Empresa B lista geocercas de A', await call('GET', `/stores/${S}/geofences`, TB), 404, 'STORE_NOT_FOUND');
  check('Empresa B edita geocerca de A', await call('PATCH', `/stores/${S}/geofences/${g1.id}`, TB, { radiusMeters: 2000 }), 404, 'STORE_NOT_FOUND');
  check('Empresa B prueba ubicación en tienda de A', await call('POST', `/stores/${S}/location-check`, TB, L(0, 5)), 404, 'STORE_NOT_FOUND');
  check('Empleado (sin stores.read) lista establecimientos', await call('GET', '/stores', E), 403, 'FORBIDDEN');
  check('Asignar la tienda nueva como sede de un empleado', await call('POST', '/employees', A, { code: 'E-10', documentType: 'CC', documentNumber: '4455', firstName: 'Ana', lastName: 'Norte', hireDate: '2026-09-01', defaultStoreId: S }), 201);
  check('Tienda de A como sede de un empleado de B', await call('POST', '/employees', TB, { code: 'E-10', documentType: 'CC', documentNumber: '4455', firstName: 'X', lastName: 'Y', hireDate: '2026-09-01', defaultStoreId: S }), 400, 'INVALID_REFERENCE');

  console.log('— Desactivar establecimiento');
  check('Desactivar establecimiento', await call('PATCH', `/stores/${S}`, A, { isActive: false }), 200);
  check('Con la tienda inactiva, ya se puede apagar su geocerca', await call('PATCH', `/stores/${S}/geofences/${g1.id}`, A, { isActive: false }), 200);
  check('Probar ubicación sin geocercas activas', await call('POST', `/stores/${S}/location-check`, A, L(0, 5)), 200, 'NO_ACTIVE_GEOFENCE');
  const bList = (await call('GET', '/stores', TB)).body;
  const a = await q(`SELECT count(*)::int n, count(distinct action)::int k FROM audit_logs WHERE "entityType" IN ('Store','Geofence')`);
  console.log(`\nTiendas visibles para B: ${bList.total} | Auditoría stores/geocercas: ${a.n} registros, ${a.k} tipos`);
  await db.end(); console.log(`\n${pass} OK, ${fail} fallos`);
})().catch(e => { console.error(e); process.exit(1); });
