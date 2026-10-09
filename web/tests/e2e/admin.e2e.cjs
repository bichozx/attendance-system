// Pruebas de punta a punta de la entrega 2 del panel (administración), con navegador real.
const { launch } = require('./browser.cjs');
const B = process.env.PANEL_URL ?? 'http://localhost:3100';
const API = process.env.API_URL ?? 'http://localhost:3000/api/v1';
let pass = 0, fail = 0;
const expect = (l, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? '✔' : '✘'} ${l}${extra ? '  ' + extra : ''}`); };
let current = null;
const step = async (label, fn) => { try { await fn(); } catch (e) { fail++; console.log(`✘ ${label}: ${e.message.split('\n').slice(0, 3).join(' / ')}`); if (current) await current.screenshot({ path: `/tmp/fallo-${label}.png` }).catch(() => {}); } };
const only = (process.env.ONLY ?? '').split(',').filter(Boolean);
const section = (name) => only.length === 0 || only.includes(name);

async function apiAs(email = 'admin@demo.local', password = 'Demo123!') {
  const r = await (await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })).json();
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
  const login = async (page, email = 'admin@demo.local', password = 'Demo123!') => {
    await page.goto(B + '/login');
    await page.getByLabel('Correo').fill(email);
    await page.getByLabel('Contraseña', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await page.waitForURL((u) => !u.pathname.startsWith('/login'));
  };
  const A = await apiAs();
  const page = await newPage();
  await login(page);
  current = page;

  if (section('stores')) {
    console.log('— Establecimientos y geocercas');
    await step('establecimientos', async () => {
      await page.goto(B + '/establecimientos');
      await page.getByRole('link', { name: 'Tienda Centro' }).click();
      await page.getByRole('heading', { name: 'Tienda Centro' }).waitFor();
      const store = (await A('GET', '/stores')).items.find((s) => s.code === 'CENTRO');

      // 137 m al norte del centro (radio 100 m): debe rechazarse con la explicación
      const lat = (store.latitude + 137 / 111195).toFixed(6);
      await page.getByLabel('Punto a probar').fill(`${lat}, ${store.longitude}`);
      await page.getByRole('button', { name: 'Probar', exact: true }).click();
      await page.getByText('Fuera de la geocerca').waitFor();
      const detail = await page.getByText(/Le faltan/).innerText();
      expect(`Punto a 137 m con radio de 100 m: rechazado y explicado ("${detail}")`, /137 m/.test(detail) && /Le faltan 37 m/.test(detail));
      expect('El diagrama dibuja el punto probado en rojo', (await page.locator('figure svg circle[fill="var(--color-missing)"]').count()) === 1);

      // Mismo punto con un GPS muy impreciso: el motivo cambia
      await page.getByLabel('Margen del GPS (m)').fill('300');
      await page.getByRole('button', { name: 'Probar', exact: true }).click();
      await page.getByText('GPS demasiado impreciso').waitFor();
      expect('Con un margen de GPS de 300 m el motivo es la precisión', true);

      // Ampliar la geocerca a 150 m: ahora el punto sí entra
      await page.getByRole('button', { name: 'Editar' }).first().click();
      const d = page.getByRole('dialog', { name: 'Editar geocerca' });
      await d.getByLabel('Radio (metros)').fill('150');
      await d.getByRole('button', { name: 'Guardar geocerca' }).click();
      await page.getByText(/actualizada$/).first().waitFor();
      await page.getByLabel('Margen del GPS (m)').fill('10');
      await page.getByRole('button', { name: 'Probar', exact: true }).click();
      await page.getByText('Podría marcar desde aquí').waitFor();
      expect('Tras ampliar el radio a 150 m, el mismo punto se acepta', await page.getByText(/radio de 150 m/).first().isVisible());

      // La única geocerca activa no se puede desactivar
      await page.getByRole('button', { name: 'Desactivar', exact: true }).click();
      await page.getByText(/Es la única geocerca activa/).waitFor();
      expect('No deja desactivar la única geocerca activa (lo explica)', true);

      // Nuevo establecimiento pegando coordenadas como las copia Google Maps (coma decimal)
      await page.goto(B + '/establecimientos');
      await page.getByRole('button', { name: 'Nuevo establecimiento' }).click();
      const n = page.getByRole('dialog', { name: 'Nuevo establecimiento' });
      await n.getByLabel('Nombre').fill('Tienda Sur');
      await n.getByLabel('Código').fill('sur');
      await n.getByLabel('Coordenadas').fill('4,5709; -74,1268');
      await n.getByRole('button', { name: 'Crear establecimiento' }).click();
      await page.getByRole('heading', { name: 'Tienda Sur' }).waitFor();
      const sur = (await A('GET', '/stores?search=Sur')).items[0];
      expect(`Crea la sede con código ${sur?.code} y coordenadas ${sur?.latitude}, ${sur?.longitude}`, sur?.code === 'SUR' && sur.latitude === 4.5709 && sur.longitude === -74.1268 && sur.activeGeofences === 1);
    });
  }

  if (section('shifts')) {
    console.log('— Turnos y periodos');
    await step('turnos', async () => {
      const iso = (d) => d.toISOString().slice(0, 10);
      const plus = (s, n) => iso(new Date(Date.parse(s + 'T12:00:00Z') + n * 864e5));
      const mondayOf = (s) => plus(s, -((new Date(s + 'T12:00:00Z').getUTCDay() + 6) % 7));
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
      const [y, m, d] = today.split('-').map(Number);
      const next = d <= 15 ? `${y}-${String(m).padStart(2, '0')}-16` : iso(new Date(Date.UTC(y, m, 1)));
      const monday = plus(mondayOf(next), 7);
      const store = (await A('GET', '/stores')).items.find((s) => s.code === 'CENTRO');
      const emps = (await A('GET', '/employees?status=ACTIVE&pageSize=100')).items;
      const [p1, p2] = [...emps].sort((a, b) => (b.defaultStore?.id === store.id) - (a.defaultStore?.id === store.id));
      const name = (e) => `${e.firstName} ${e.lastName}`;

      await page.goto(`${B}/turnos?sede=${store.id}&semana=${monday}`);
      await page.getByRole('heading', { name: 'Periodos' }).waitFor();
      await page.getByRole('button', { name: 'Nuevo periodo' }).click();
      const pd = page.getByRole('dialog', { name: 'Nuevo periodo' });
      await pd.getByRole('button', { name: 'Crear periodo' }).click();
      await page.getByText(/creado en borrador/).waitFor();
      await page.getByText(new RegExp(`^${Number(mondayOf(next).slice(8))} – `)).waitFor({ timeout: 5000 });
      expect('Tras crearlo, la semana salta al inicio del periodo', true);
      await page.goto(`${B}/turnos?sede=${store.id}&semana=${monday}`);
      await page.getByRole('heading', { name: 'Periodos' }).waitFor();
      const period = (await A('GET', `/schedule-periods?storeId=${store.id}&status=DRAFT`)).items[0];
      expect(`Sugiere y crea la quincena siguiente en borrador (${period?.name})`, !!period && period.startDate <= monday && period.endDate >= plus(monday, 6));

      // Lunes a viernes, repetido hasta el fin del periodo, turno de mañana con dos personas
      await page.getByRole('button', { name: 'Nuevo turno' }).click();
      const sd = page.getByRole('dialog', { name: 'Nuevo turno' });
      for (const day of ['mar', 'mié', 'jue', 'vie']) await sd.locator('label', { hasText: new RegExp(`^${day}\\s*\\d`) }).click();
      await sd.getByRole('button', { name: /Hasta el fin del periodo/ }).click();
      await sd.getByRole('button', { name: /Mañana 06:00/ }).click();
      await sd.getByRole('checkbox', { name: new RegExp(name(p1)) }).check();
      await sd.getByRole('checkbox', { name: new RegExp(name(p2)) }).check();
      const label = await sd.getByRole('button', { name: /^Crear \d+ turnos$/ }).innerText();
      const expected = Number(label.match(/\d+/)[0]);
      await sd.getByRole('button', { name: /^Crear \d+ turnos$/ }).click();
      await page.getByText(`${expected} turnos creados`).waitFor();
      const created = await A('GET', `/shifts?storeId=${store.id}&schedulePeriodId=${period.id}&from=${period.startDate}&to=${period.endDate}`);
      expect(`Crea ${expected} turnos de lunes a viernes hasta el fin del periodo`, created.length === expected && expected >= 5 && created.every((s) => s.local.startTime === '06:00' && s.assignments.length === 2));
      expect('La semana muestra los turnos en borrador', (await page.getByRole('button', { name: new RegExp(`06:00–14:00`) }).count()) === 5);

      // Cruce: la misma persona otra vez el lunes a otra hora
      await page.getByRole('button', { name: /^Agregar turno el lun/ }).click();
      await sd.getByRole('button', { name: /Completo 08:00/ }).click();
      await sd.getByRole('checkbox', { name: new RegExp(name(p1)) }).check();
      await sd.getByRole('button', { name: 'Crear turno' }).click();
      const why = await sd.getByText(/ya tiene un turno que se cruza/).innerText();
      expect(`Un cruce se explica con el nombre ("${why}")`, why.includes(name(p1)));
      await sd.getByRole('button', { name: 'Cancelar' }).click();

      // Publicar
      await page.getByRole('button', { name: 'Publicar', exact: true }).click();
      await page.getByRole('dialog', { name: 'Publicar periodo' }).getByRole('button', { name: 'Publicar' }).click();
      await page.getByText(/publicado$/).first().waitFor();
      expect('Publica el periodo', (await A('GET', `/schedule-periods/${period.id}`)).status === 'PUBLISHED');

      // Retirar a una persona y cancelar un turno
      const lunes = page.getByRole('region', { name: /^lun/ });
      await lunes.getByRole('button', { name: /06:00–14:00/ }).click();
      const td = page.getByRole('dialog', { name: 'Turno' });
      await td.getByText('Marca desde').waitFor();
      await td.locator('li', { hasText: name(p2) }).getByRole('button', { name: 'Retirar' }).click();
      await page.getByText('Persona retirada del turno').waitFor();
      await td.locator('li', { hasText: name(p2) }).waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
      expect('Retira a una persona del turno', !(await td.locator('li', { hasText: name(p2) }).count()));
      await td.getByRole('button', { name: 'Cancelar turno' }).click();
      await td.getByLabel('Motivo (opcional)').fill('Cierre por inventario');
      await td.getByRole('button', { name: 'Cancelar turno' }).click();
      await page.getByText('Turno cancelado').waitFor();
      await page.waitForTimeout(500);
      expect('El turno cancelado sale de la semana', (await lunes.getByRole('button', { name: /06:00–14:00/ }).count()) === 0);
      await page.getByLabel('Mostrar cancelados').check();
      await lunes.locator('.line-through').first().waitFor();
      expect('Con "Mostrar cancelados" aparece tachado', true);
    });
  }

  if (section('users')) {
    console.log('— Usuarios, roles y empresa');
    await step('usuarios', async () => {
      await page.goto(B + '/usuarios');
      await page.getByRole('button', { name: 'Nuevo usuario' }).click();
      const d = page.getByRole('dialog', { name: 'Nuevo usuario' });
      await d.getByRole('textbox', { name: /^Correo/ }).fill('valentina.rios@demo.local');
      await d.getByLabel('Nombres').fill('Valentina');
      await d.getByLabel('Apellidos').fill('Ríos');
      await d.getByLabel('Rol').selectOption({ label: 'Supervisor' });
      await d.getByRole('radio', { name: /contraseña temporal/ }).check();
      const password = await d.getByRole('textbox', { name: 'Contraseña temporal' }).inputValue();
      await d.getByRole('button', { name: 'Crear usuario' }).click();
      await d.getByText('Cuenta creada').waitFor();
      const login = await (await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'valentina.rios@demo.local', password }) })).json();
      expect(`Crea el usuario con contraseña generada (${password}) que obliga a cambiarla`, login.user?.mustChangePassword === true && login.company?.role.code === 'SUPERVISOR');
      await d.getByRole('button', { name: 'Listo' }).click();

      // Correo que ya tiene acceso
      await page.getByRole('button', { name: 'Nuevo usuario' }).click();
      await d.getByRole('textbox', { name: /^Correo/ }).fill('admin@demo.local');
      await d.getByLabel('Nombres').fill('Ana');
      await d.getByLabel('Apellidos').fill('Otra');
      await d.getByRole('button', { name: 'Crear usuario' }).click();
      await d.getByText('Ese correo ya tiene acceso a esta empresa.').waitFor();
      expect('Un correo que ya tiene acceso se explica', true);
      await d.getByRole('button', { name: 'Cancelar' }).click();

      // Por defecto: invitación por correo, sin contraseña que repartir
      await page.getByRole('button', { name: 'Nuevo usuario' }).click();
      await d.getByRole('textbox', { name: /^Correo/ }).fill('julian.mora@demo.local');
      await d.getByLabel('Nombres').fill('Julián');
      await d.getByLabel('Apellidos').fill('Mora');
      await d.getByRole('button', { name: 'Crear usuario' }).click();
      await d.getByText('Invitación enviada a julian.mora@demo.local').waitFor();
      await d.getByRole('button', { name: 'Listo' }).click();
      await page.locator('tr', { hasText: 'Julián Mora' }).getByText('Invitación pendiente').waitFor();
      await page.getByRole('button', { name: 'Julián Mora' }).click();
      const jd = page.getByRole('dialog', { name: 'Julián Mora' });
      await jd.getByRole('button', { name: 'Reenviar invitación' }).click();
      await page.getByText('Invitación reenviada a julian.mora@demo.local').waitFor();
      expect('Invita por correo, lo marca como pendiente y permite reenviar', true);
      await jd.getByRole('button', { name: 'Cerrar' }).click();

      // Propia cuenta: protegida
      await page.getByRole('button', { name: 'Ana Administradora' }).click();
      const self = page.getByRole('dialog', { name: 'Ana Administradora' });
      expect('La propia cuenta no se puede degradar ni desactivar', (await self.getByText('Esta es tu cuenta').isVisible()) && (await self.getByRole('button', { name: 'Retirar acceso' }).count()) === 0);
      await self.getByRole('button', { name: 'Cerrar' }).click();

      // Cambiar rol y retirar acceso
      await page.getByRole('button', { name: 'Valentina Ríos' }).click();
      const u = page.getByRole('dialog', { name: 'Valentina Ríos' });
      await u.getByLabel('Rol').selectOption({ label: 'Empleado' });
      await u.getByRole('button', { name: 'Cambiar rol' }).click();
      await page.getByText('Ahora es Empleado').waitFor();
      await u.getByRole('button', { name: 'Retirar acceso' }).click();
      await page.getByText('Acceso retirado').waitFor();
      await u.getByRole('button', { name: 'Restablecer acceso' }).waitFor();
      const vale = (await A('GET', '/users?search=valentina.rios')).items[0];
      expect('Cambia el rol y retira el acceso', vale.role.code === 'EMPLOYEE' && vale.membershipStatus === 'DISABLED');
      await u.getByRole('button', { name: 'Enviar enlace' }).click();
      await page.getByText('Enlace enviado a valentina.rios@demo.local').waitFor();
      expect('Envía el enlace de recuperación', true);
      await u.getByRole('button', { name: 'Cerrar' }).click();
    });

    await step('roles', async () => {
      await page.goto(B + '/roles');
      await page.getByRole('button', { name: /^Supervisor/ }).click();
      expect('Los roles del sistema son de solo lectura', (await page.getByRole('button', { name: 'Editar', exact: true }).count()) === 0 && (await page.getByRole('checkbox').first().isDisabled()));
      await page.getByRole('button', { name: 'Duplicar' }).click();
      await page.getByLabel('Nombre', { exact: true }).fill('Jefe de tienda');
      await page.getByRole('checkbox', { name: /Ver reportes/ }).uncheck();
      await page.getByRole('checkbox', { name: /Exportar reportes/ }).check();
      expect('Marcar "Exportar" marca también "Ver reportes"', await page.getByRole('checkbox', { name: /Ver reportes/ }).isChecked());
      await page.getByRole('button', { name: 'Crear rol' }).click();
      await page.getByText('Rol Jefe de tienda creado').waitFor();
      const role = (await A('GET', '/roles')).find((r) => r.name === 'Jefe de tienda');
      const sup = (await A('GET', '/roles')).find((r) => r.code === 'SUPERVISOR');
      expect(`Crea el rol ${role?.code} con los permisos del supervisor + exportar`, role?.code === 'JEFE_DE_TIENDA' && role.permissions.includes('reports.export') && sup.permissions.every((p) => role.permissions.includes(p)));

      // En uso: no se puede eliminar
      const vale = (await A('GET', '/users?search=valentina.rios')).items[0];
      await A('PATCH', `/users/${vale.id}/role`, { roleId: role.id });
      await page.getByRole('button', { name: 'Eliminar' }).click();
      await page.getByRole('button', { name: 'Eliminar' }).last().click();
      await page.getByText(/Hay usuarios con este rol/).waitFor();
      expect('Un rol en uso no se elimina y se explica por qué', true);
    });

    await step('empresa', async () => {
      await page.goto(B + '/empresa');
      await page.getByLabel('Tolerancia de llegada (min)').fill('5');
      expect('El ejemplo se actualiza al escribir', await page.getByText(/después de las\s*08:05/).isVisible());
      await page.getByLabel('Nombre comercial').fill('Empresa Demo Norte');
      await page.getByRole('button', { name: 'Guardar cambios' }).click();
      await page.getByText('Configuración guardada').waitFor();
      const c = await A('GET', '/company');
      await page.locator('aside').getByText('Empresa Demo Norte').waitFor();
      expect('Guarda la configuración y la barra lateral muestra el nombre nuevo', c.shiftDefaults.lateToleranceMinutes === 5 && c.name === 'Empresa Demo Norte');
      await A('PATCH', '/company', { name: 'Empresa Demo', shiftDefaults: { lateToleranceMinutes: 0 } });
    });
  }

  if (section('audit')) {
    console.log('— Auditoría');
    await step('auditoria', async () => {
      await A('PATCH', '/company', { shiftDefaults: { lateToleranceMinutes: 7 } });
      await A('PATCH', '/company', { shiftDefaults: { lateToleranceMinutes: 0 } });
      await page.goto(B + '/auditoria');
      const entry = page.locator('li', { hasText: 'cambió la configuración de la empresa' }).first();
      await entry.waitFor();
      await entry.getByRole('button', { name: /Ver detalle/ }).click();
      const row = entry.locator('tr', { hasText: 'Tolerancia (min)' });
      const cells = await row.locator('td').allInnerTexts();
      expect(`Muestra antes y después con nombres legibles (${cells.join(' → ')})`, cells[0].includes('Reglas de turnos') && cells[1] === '7' && cells[2] === '0');
      await page.getByLabel('Tema').selectOption({ label: 'Empresa' });
      await page.waitForTimeout(800);
      const texts = await page.locator('ol > li').allInnerTexts();
      expect(`Filtra por tema (${texts.length} registros de empresa)`, texts.length >= 2 && texts.every((t) => /empresa/.test(t)));
      await page.getByLabel('Hecho por').selectOption({ label: 'Carlos Pérez' });
      await page.getByText('Nada registrado con estos filtros').waitFor();
      expect('Filtra por persona', true);
    });
  }

  if (section('platform')) {
    console.log('— Consola de plataforma');
    await step('plataforma', async () => {
      await page.goto(B + '/plataforma');
      await page.waitForURL((u) => u.pathname === '/');
      expect('Un administrador de empresa no entra a la consola de plataforma', true);

      const sa = await newPage();
      current = sa;
      await login(sa, 'superadmin@asistencia.local', 'Cambiar123!');
      await sa.waitForURL((u) => u.pathname === '/plataforma');
      expect('El superadministrador sin empresa llega a la consola', await sa.getByRole('heading', { name: 'Empresas' }).isVisible());
      await sa.getByRole('link', { name: 'Empresa Demo' }).waitFor();
      expect('La lista muestra la empresa demo con sus números', (await sa.locator('tr', { hasText: 'Empresa Demo' }).locator('td').nth(2).innerText()) !== '0');

      await sa.getByRole('button', { name: 'Nueva empresa' }).click();
      const d = sa.getByRole('dialog', { name: 'Nueva empresa' });
      await d.getByLabel('Nombre comercial').fill('Panadería Doña Rosa');
      await d.getByLabel('NIT (opcional)').fill('900123456-7');
      await d.getByRole('textbox', { name: /^Correo/ }).fill('rosa@panaderia.local');
      await d.getByLabel('Nombres').fill('Rosa');
      await d.getByLabel('Apellidos').fill('Martínez');
      await d.getByRole('button', { name: 'Crear empresa' }).click();
      await sa.getByRole('heading', { name: 'Panadería Doña Rosa' }).waitFor();
      expect('Crea la empresa en periodo de prueba', await sa.getByText('Prueba', { exact: true }).isVisible());
      expect('El administrador aparece pendiente de crear su contraseña', await sa.getByText('Aún no ha creado su contraseña').isVisible());
      await sa.getByRole('button', { name: 'Reenviar invitación' }).click();
      await sa.getByText('Invitación reenviada a rosa@panaderia.local').waitFor();
      expect('Reenvía la invitación', true);

      await sa.getByLabel('NIT').fill('900000000-0');
      await sa.getByRole('button', { name: 'Guardar datos' }).click();
      await sa.getByText('Ya hay otra empresa con ese NIT.').waitFor();
      expect('Un NIT repetido se explica', true);

      await sa.getByRole('button', { name: 'Suspender' }).click();
      await sa.getByLabel('Motivo (opcional)').fill('Factura vencida');
      await sa.getByRole('button', { name: 'Confirmar' }).click();
      await sa.getByText('Suspendida', { exact: true }).waitFor();
      await sa.getByRole('button', { name: 'Reactivar' }).click();
      await sa.getByRole('button', { name: 'Confirmar' }).click();
      await sa.getByText('Activa', { exact: true }).waitFor();
      expect('Suspende y reactiva con motivo', true);
      expect(`Sin errores de JavaScript en la consola (${sa.errors.length})`, sa.errors.length === 0, sa.errors.slice(0, 3).join(' | '));
      current = page;
    });
  }

  expect(`Sin errores de JavaScript en el navegador (${page.errors.length})`, page.errors.length === 0, page.errors.slice(0, 3).join(' | '));
  await browser.close();
  console.log(`\n${pass} OK, ${fail} fallos`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FALLO', e); process.exit(1); });
