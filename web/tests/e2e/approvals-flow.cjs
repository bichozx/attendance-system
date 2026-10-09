// Un supervisor aprueba una novedad y corrige una marcación desde el panel.
const { launch } = require('./browser.cjs');
const B = process.env.PANEL_URL ?? 'http://localhost:3100';
let pass = 0, fail = 0;
const expect = (l, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? '✔' : '✘'} ${l}${extra ? '  ' + extra : ''}`); };
(async () => {
  const browser = await launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: 'America/Bogota' })).newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(B + '/login');
  await page.getByLabel('Correo').fill('admin@demo.local'); await page.getByLabel('Contraseña', { exact: true }).fill('Demo123!');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click(); await page.waitForURL(B + '/');

  await page.getByRole('link', { name: /Aprobaciones/ }).click(); await page.waitForURL('**/aprobaciones');
  // Esperar a que las tres bandejas tengan su conteo
  await page.getByRole('tab', { name: /Cambios de turno\s*\d/ }).waitFor({ timeout: 10000 });
  const tabs = await page.getByRole('tab').allInnerTexts();
  expect(`Pestañas con conteos: ${tabs.map((t) => t.replace(/\n/g, ' ')).join(' | ')}`, tabs.length === 3 && tabs.every((t) => /\d/.test(t)));
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/tmp/shot-aprobaciones-1440.png', fullPage: true });

  // 1) Aprobar la justificación de tardanza de Jorge
  await page.getByRole('button', { name: 'Aprobar' }).first().click();
  await page.getByText(/Aprobada: Justificación de tardanza de Jorge/).waitFor({ timeout: 8000 });
  expect('Aprueba la novedad y avisa con un mensaje', true);
  await page.getByText('No hay novedades pendientes').waitFor({ timeout: 8000 });
  expect('La bandeja de novedades queda vacía', true);

  // 2) Corregir las horas de la marcación de Marta
  await page.getByRole('tab', { name: /Marcaciones/ }).click();
  await page.getByText('Se envió horas después (sin señal)').waitFor();
  await page.screenshot({ path: '/tmp/shot-aprobaciones-marcaciones-1440.png', fullPage: true });
  await page.getByRole('button', { name: 'Corregir horas' }).click();
  const dialog = page.getByRole('dialog', { name: 'Corregir horas' });
  await dialog.getByLabel('Hora de entrada').fill('08:41');
  await dialog.getByLabel('Motivo de la corrección').fill('Marcó al llegar pero sin señal; confirmado con la cámara');
  await page.screenshot({ path: '/tmp/shot-corregir-1440.png' });
  await dialog.getByRole('button', { name: 'Guardar corrección' }).click();
  await page.getByText(/Corregida la marcación de Marta/).waitFor({ timeout: 8000 });
  expect('Corrige la marcación desde el diálogo', true);

  // 3) Rechazar sin motivo no se puede; con motivo, sí
  await page.getByRole('tab', { name: /Cambios de turno/ }).click();
  await page.getByText(/intercambian turnos/).waitFor();
  await page.screenshot({ path: '/tmp/shot-aprobaciones-cambios-1440.png', fullPage: true });
  await page.getByRole('button', { name: 'Rechazar' }).click();
  const rd = page.getByRole('dialog', { name: 'Rechazar cambio de turno' });
  await rd.getByRole('button', { name: 'Rechazar cambio' }).click();
  const invalid = await rd.getByLabel('Motivo').evaluate((el) => !el.checkValidity());
  expect('Sin motivo el formulario no se envía', invalid);
  await rd.getByLabel('Motivo').fill('Necesitamos a Carlos en caja ese día');
  await rd.getByRole('button', { name: 'Rechazar cambio' }).click();
  await page.getByText('Cambio rechazado').waitFor({ timeout: 8000 });
  expect('Rechaza con motivo', true);
  await page.waitForTimeout(1500);
  const badge = await page.getByRole('link', { name: /Aprobaciones/ }).innerText();
  expect(`El contador del menú se actualiza ("${badge.replace(/\n/g, ' ')}")`, !/\d/.test(badge));
  expect(`Sin errores de JavaScript en el navegador (${errors.length})`, errors.length === 0, errors.join(' | '));
  await browser.close(); console.log(`\n${pass} OK, ${fail} fallos`);
})().catch((e) => { console.error('FALLO', e.message); process.exit(1); });
