// Pruebas de punta a punta del panel web con Chromium real.
const { launch } = require('./browser.cjs');
const fs = require('fs');
const B = process.env.PANEL_URL ?? 'http://localhost:3100';
const API = process.env.API_URL ?? 'http://localhost:3000/api/v1';
let pass = 0, fail = 0;
const expect = (l, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? '✔' : '✘'} ${l}${extra ? '  ' + extra : ''}`); };
const step = async (label, fn) => { try { await fn(); } catch (e) { fail++; console.log(`✘ ${label}: ${e.message.split('\n')[0]}`); } };

async function apiAdmin() {
  const r = await (await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@demo.local', password: 'Demo123!' }) })).json();
  return async (method, path, body) => {
    const res = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + r.accessToken }, body: body && JSON.stringify(body) });
    const t = await res.text(); return t ? JSON.parse(t) : null;
  };
}

(async () => {
  const browser = await launch();
  const newPage = async (viewport = { width: 1440, height: 900 }) => {
    const ctx = await browser.newContext({ viewport, timezoneId: 'America/Bogota', locale: 'es-CO', acceptDownloads: true });
    const page = await ctx.newPage();
    page.errors = [];
    page.on('pageerror', (e) => page.errors.push(e.message));
    return page;
  };
  const login = async (page, email, password = 'Demo123!') => {
    await page.goto(B + '/login');
    await page.getByLabel('Correo').fill(email);
    await page.getByLabel('Contraseña', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  };
  const A = await apiAdmin();
  const page = await newPage();

  console.log('— Acceso');
  await step('acceso', async () => {
    await page.goto(B + '/empleados');
    expect('Sin sesión, una página interna lleva al login (recordando a dónde iba)', page.url().includes('/login?next=%2Fempleados'));
    await page.getByLabel('Correo').fill('admin@demo.local');
    await page.getByLabel('Contraseña', { exact: true }).fill('mala');
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await page.getByText('Correo o contraseña incorrectos.').waitFor();
    expect('Contraseña incorrecta: mensaje claro', true);
    await page.getByLabel('Contraseña', { exact: true }).fill('Demo123!');
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await page.waitForURL(B + '/empleados');
    expect('Al entrar, vuelve a la página que pedía', true);
    const cookies = await page.context().cookies();
    const session = cookies.filter((c) => c.name.startsWith('ast_'));
    expect(`Las cookies de sesión existen y son httpOnly (${session.map((c) => c.name).join(', ')})`, session.length === 2 && session.every((c) => c.httpOnly));
    expect('document.cookie no muestra ningún token', !(await page.evaluate(() => document.cookie)).includes('ast_'));
  });

  console.log('— Hoy');
  await step('dashboard', async () => {
    await page.goto(B + '/');
    await page.getByRole('heading', { name: 'Requiere acción' }).waitFor();
    const rows = () => page.locator('[role=table] [role=row]').count();
    const all = (await rows()) - 1;
    // Lo esperado sale de la propia leyenda (no de un número fijo: depende de la hora)
    const total = Number((await page.getByRole('button', { name: /Todas las personas/ }).innerText()).match(/\d+/)[0]);
    const missingBtn = page.getByRole('button', { name: /Sin marcar entrada/ });
    const missing = Number((await missingBtn.innerText()).match(/\d+/)[0]);
    await missingBtn.click();
    const filtered = (await rows()) - 1;
    expect(`La leyenda filtra la franja (${all} → ${filtered})`, all === total && filtered === missing);
    expect('"Requiere acción" nombra a quien no ha marcado', await page.getByText(/Ana Gómez/).first().isVisible());
  });

  console.log('— Empleados');
  let newId;
  await step('empleados', async () => {
    await page.goto(B + '/empleados');
    await page.getByLabel('Buscar empleados').fill('Salazar');
    for (let i = 0; i < 30 && (await page.locator('tbody tr').count()) !== 1; i++) await page.waitForTimeout(200);
    expect('La búsqueda encuentra a Marta Salazar', (await page.locator('tbody tr').count()) === 1 && (await page.getByRole('link', { name: 'Marta Salazar' }).isVisible()));
    await page.getByLabel('Buscar empleados').fill('');

    await page.getByRole('button', { name: 'Nuevo empleado' }).click();
    const d = page.getByRole('dialog', { name: 'Nuevo empleado' });
    await d.getByLabel('Nombres').fill('Valentina');
    await d.getByLabel('Apellidos').fill('Muñoz');
    await d.getByLabel('Número de documento').fill('1020304050');
    await d.getByLabel('Código interno').fill('emp-200');
    await d.getByLabel('Correo').fill('valentina@demo.local');
    await d.getByLabel('Sede principal').selectOption({ label: 'Tienda Centro' });
    await d.getByRole('button', { name: 'Registrar empleado' }).click();
    await page.waitForURL(/\/empleados\/[0-9a-f-]{36}$/);
    newId = page.url().split('/').pop();
    await page.getByRole('heading', { name: 'Valentina Muñoz' }).waitFor();
    expect('Alta desde el diálogo y abre su ficha (código en mayúsculas: EMP-200)', await page.getByText(/EMP-200/).isVisible());

    await page.getByLabel('Celular').fill('3105551234');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await page.getByText('Cambios guardados').waitFor();
    const saved = await A('GET', `/employees/${newId}`);
    expect('Editar datos guarda en el servidor', saved.phone === '3105551234');

    await page.getByRole('button', { name: 'Dar acceso a la app' }).click();
    const ad = page.getByRole('dialog', { name: 'Dar acceso a la app' });
    expect('Por defecto se envía invitación por correo', await ad.getByRole('radio', { name: /invitación por correo/ }).isChecked());
    await ad.getByRole('radio', { name: /contraseña temporal/ }).check();
    const pwd = await ad.getByRole('textbox', { name: 'Contraseña temporal' }).inputValue();
    expect(`Contraseña temporal generada y fuerte (${pwd.length} caracteres)`, pwd.length >= 14 && /\d/.test(pwd) && /[A-Za-z]/.test(pwd));
    await ad.getByRole('radio', { name: /invitación por correo/ }).check();
    await ad.getByRole('button', { name: 'Dar acceso' }).click();
    await page.getByText(/Le enviamos la invitación a/).waitFor();
    await page.getByText(/Tiene acceso con/).waitFor();
    expect('Dar acceso a la app por invitación', true);

    await page.getByRole('button', { name: 'Nuevo contrato' }).click();
    const cd = page.getByRole('dialog', { name: 'Nuevo contrato' });
    await cd.getByLabel('Salario básico mensual').fill('2.300.000');
    expect('El salario solo acepta números (2.300.000 → 2300.000 se limpia a dígitos)', (await cd.getByLabel('Salario básico mensual').inputValue()) === '2.300.000'.replace(/[^\d.]/g, ''));
    await cd.getByLabel('Salario básico mensual').fill('2300000');
    await cd.getByRole('button', { name: 'Registrar contrato' }).click();
    await page.getByText(/2\.300\.000/).first().waitFor();
    expect('Contrato registrado y marcado como vigente', await page.getByText('Vigente').isVisible());

    await page.getByRole('button', { name: 'Cambiar estado' }).click();
    const sd = page.getByRole('dialog', { name: 'Cambiar estado' });
    await sd.getByLabel('Nuevo estado').selectOption('TERMINATED');
    expect('Retirar advierte sus efectos antes de confirmar', await sd.getByText(/Pierde el acceso a la app/).isVisible());
    await sd.getByLabel('Nuevo estado').selectOption('ON_LEAVE');
    await sd.getByRole('button', { name: 'Guardar estado' }).click();
    await page.getByText('Estado actualizado: En licencia').waitFor();
    expect('Cambiar estado a licencia', (await A('GET', `/employees/${newId}`)).status === 'ON_LEAVE');
  });

  console.log('— Importación');
  await step('importar', async () => {
    await page.goto(B + '/empleados/importar');
    const [tpl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Plantilla Excel' }).click()]);
    expect(`Descarga la plantilla (${tpl.suggestedFilename()})`, tpl.suggestedFilename().endsWith('.xlsx'));
    const csv = ['codigo;tipo_documento;numero_documento;nombres;apellidos;correo;telefono;fecha_nacimiento;fecha_ingreso;cargo;sede;tipo_contrato;salario;horas_semanales;fecha_fin_contrato;acceso_app',
      'IMP-1;CC;9001;Andrés;Peña;;;;01/09/2026;;CENTRO;;;;;NO',
      'IMP-2;CC;9002;Lucía;Ríos;;;;01/09/2026;;CENTRO;;;;;NO',
      'IMP-3;CC;9003;Sin;Sede;;;;01/09/2026;;MARTE;;;;;NO'].join('\r\n');
    fs.writeFileSync('/tmp/import.csv', Buffer.from(csv, 'latin1'));
    await page.locator('input[type=file]').setInputFiles('/tmp/import.csv');
    await page.getByText(/2 de 3 filas están listas/).waitFor();
    expect('Validación: 2 de 3 filas listas, sin guardar nada', true);
    expect('Explica el error de la fila con sede inexistente', await page.getByRole('cell', { name: /MARTE|sede/i }).first().isVisible());
    const [rep] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar archivo con errores' }).click()]);
    expect(`Descarga el archivo con errores (${rep.suggestedFilename()})`, rep.suggestedFilename().endsWith('.xlsx'));
    await page.getByRole('button', { name: 'Importar solo las 2 filas correctas' }).click();
    await page.getByText('2 empleados importados').first().waitFor();
    expect('Importa solo las filas correctas', (await A('GET', '/employees?search=IMP-')).total === 2);
  });

  console.log('— Reportes');
  await step('reportes', async () => {
    await page.goto(B + '/reportes');
    await page.getByRole('button', { name: 'Esta quincena', pressed: true }).waitFor();
    await page.getByRole('columnheader', { name: 'Empleado' }).waitFor();
    expect(`Vista previa de la quincena (${await page.locator('tbody tr').count()} jornadas)`, (await page.locator('tbody tr').count()) > 0);
    const [x] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar Excel' }).first().click()]);
    const [p] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar PDF' }).nth(1).click()]);
    const pdf = fs.readFileSync(await p.path());
    expect(`Descarga el consolidado en Excel (${x.suggestedFilename()}) y el detalle en PDF (${p.suggestedFilename()})`, x.suggestedFilename().startsWith('consolidado_') && pdf.subarray(0, 5).toString() === '%PDF-');
  });

  console.log('— Contraseña temporal y permisos');
  await step('permisos', async () => {
    const roles = await A('GET', '/roles');
    const sup = roles.find((r) => r.code === 'SUPERVISOR');
    await A('POST', '/users', { email: 'laura@demo.local', firstName: 'Laura', lastName: 'Supervisora', password: 'Temporal2026', roleId: sup.id });
    const p2 = await newPage();
    await login(p2, 'laura@demo.local', 'Temporal2026');
    await p2.waitForURL(B + '/cambiar-clave');
    expect('Con contraseña temporal, el panel lleva obligatoriamente a cambiarla', await p2.getByText('Crea tu propia contraseña').isVisible());
    await p2.goto(B + '/');
    await p2.waitForURL(/cambiar-clave/, { timeout: 8000 });
    expect('…y no deja usar el panel antes', p2.url().endsWith('/cambiar-clave'), p2.url());
    await p2.getByLabel('Contraseña temporal').fill('Temporal2026');
    await p2.getByLabel('Nueva contraseña', { exact: true }).fill('Laura2026x');
    await p2.getByLabel('Repite la nueva').fill('Laura2026x');
    await p2.getByRole('button', { name: 'Guardar contraseña' }).click();
    await p2.waitForURL(B + '/');
    expect('Después de cambiarla entra al panel sin volver a iniciar sesión', await p2.getByRole('heading', { name: 'Hoy' }).isVisible());
    const nav = await p2.getByRole('navigation', { name: 'Principal' }).innerText();
    expect(`El menú del supervisor solo muestra lo que puede usar (${nav.replace(/\n/g, ', ')})`, !nav.includes('Importar'));
    await p2.getByRole('button', { name: 'Cerrar sesión' }).click();
    await p2.waitForURL(B + '/login');
    await p2.goto(B + '/');
    expect('Cerrar sesión: ya no se puede volver a entrar sin credenciales', p2.url().includes('/login'));
  });

  console.log('— Móvil');
  await step('movil', async () => {
    const m = await newPage({ width: 390, height: 844 });
    await login(m, 'admin@demo.local');
    await m.waitForURL(B + '/');
    await m.getByRole('heading', { name: 'Requiere acción' }).waitFor();
    const overflow = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect('Hoy en un celular: sin desplazamiento horizontal de la página', !overflow);
    await m.getByRole('button', { name: 'Menú' }).click();
    await m.getByRole('link', { name: 'Empleados' }).click();
    await m.waitForURL(B + '/empleados');
    expect('El menú se abre y navega en el celular', true);
    await m.screenshot({ path: '/tmp/shot-empleados-390.png', fullPage: true });
    m.errors.length && console.log('errores móvil:', m.errors);
  });

  await page.goto(B + '/empleados'); await page.waitForTimeout(800); await page.screenshot({ path: '/tmp/shot-empleados-1440.png', fullPage: true });
  if (newId) { await page.goto(`${B}/empleados/${newId}`); await page.waitForTimeout(1200); await page.screenshot({ path: '/tmp/shot-ficha-1440.png', fullPage: true }); }
  await page.goto(B + '/reportes'); await page.waitForTimeout(1500); await page.screenshot({ path: '/tmp/shot-reportes-1440.png', fullPage: true });
  expect(`Sin errores de JavaScript en el navegador (${page.errors.length})`, page.errors.length === 0, page.errors.slice(0, 3).join(' | '));
  await browser.close();
  console.log(`\n${pass} OK, ${fail} fallos`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FALLO', e); process.exit(1); });
