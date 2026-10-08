#!/usr/bin/env node
/**
 * Ejecutor de las pruebas de punta a punta (Windows, macOS, Linux y CI).
 *
 * Por cada suite: reinicia la base de PRUEBAS, arranca el backend compilado con la
 * configuración que la suite necesita, espera /health/ready, corre la suite y lo detiene.
 *
 *   pnpm run build
 *   E2E_DATABASE_URL=postgresql://attendance:attendance_dev@localhost:5432/attendance_test node test/e2e/run.mjs
 *   node test/e2e/run.mjs security reports      # solo algunas suites
 *
 * Variables:
 *   E2E_DATABASE_URL  (obligatoria) base de pruebas: su nombre DEBE contener "test"
 *   E2E_PORT          puerto del backend de prueba (3999)
 *   E2E_RESET_CMD     cómo reiniciar la base (por defecto: prisma migrate reset + seed)
 */
import { execSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, openSync, closeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SUITES_DIR = join(ROOT, 'test/e2e/suites');
const PORT = process.env.E2E_PORT ?? '3999';
const BASE_URL = `http://localhost:${PORT}`;
const DB_URL = process.env.E2E_DATABASE_URL;
const RESET_CMD =
  process.env.E2E_RESET_CMD ?? 'pnpm exec prisma migrate reset --force && pnpm exec prisma db seed';

/** Configuración de cada suite (el resto de procesos periódicos queda apagado). */
const SUITES = {
  security: { AUTH_MAX_FAILED_LOGINS: '3', PASSWORD_RESET_URL: 'http://localhost:3001/restablecer-clave?token={token}' },
  invitations: { PASSWORD_RESET_URL: 'http://localhost:3001/restablecer-clave?token={token}' },
  companies: {},
  stores: {},
  shifts: {},
  'shift-changes': {},
  attendance: { ATTENDANCE_JOB_INTERVAL_SECONDS: '2' },
  incidents: {},
  notifications: {
    NOTIFICATIONS_DISPATCH_INTERVAL_SECONDS: '1',
    REMINDERS_INTERVAL_SECONDS: '1',
    PUSH_RECEIPTS_INTERVAL_SECONDS: '2',
  },
  reports: {},
  import: {},
  hardening: { MAINTENANCE_INTERVAL_SECONDS: '2' },
};

const BASE_ENV = {
  NODE_ENV: 'test',
  PORT,
  DATABASE_URL: DB_URL,
  MAIL_TRANSPORT: 'console',
  PUSH_PROVIDER: 'console',
  LOG_PRETTY: 'true',
  LOG_LEVEL: 'info',
  SWAGGER_ENABLED: 'false',
  AUTH_LOGIN_RATE_LIMIT: '10000', // sin esto, cada suite tendría que esperar minutos
  ATTENDANCE_JOB_INTERVAL_SECONDS: '0',
  NOTIFICATIONS_DISPATCH_INTERVAL_SECONDS: '0',
  REMINDERS_INTERVAL_SECONDS: '0',
  PUSH_RECEIPTS_INTERVAL_SECONDS: '0',
  MAINTENANCE_INTERVAL_SECONDS: '0',
  REDIS_URL: '', // límite en memoria: cada suite empieza limpia
};

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(2);
}

function guard() {
  if (!DB_URL) fail('Defina E2E_DATABASE_URL (una base SOLO para pruebas; se borra en cada suite).');
  const name = new URL(DB_URL).pathname.slice(1);
  if (!/test/i.test(name)) {
    fail(`La base "${name}" no parece de pruebas. Por seguridad, su nombre debe contener "test".`);
  }
  if (!existsSync(join(ROOT, 'dist/main.js'))) fail('No existe dist/main.js: ejecute primero "pnpm run build".');
}

async function waitReady(server, log, timeoutMs = 40_000) {
  const until = Date.now() + timeoutMs;
  let lastStatus = 'sin respuesta HTTP';
  while (Date.now() < until) {
    if (server.exitCode !== null) {
      throw new Error(
        `El backend terminó antes de estar listo (código ${server.exitCode}); log: ${log}`,
      );
    }
    try {
      const r = await fetch(`${BASE_URL}/health/ready`);
      if (r.ok) return;
      lastStatus = `HTTP ${r.status}`;
    } catch {
      /* aún arrancando */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(
    `El backend no estuvo listo a tiempo (última respuesta: ${lastStatus}); log: ${log}`,
  );
}

function stop(child) {
  return new Promise((resolveStop) => {
    if (child.exitCode !== null) return resolveStop();
    child.once('exit', () => resolveStop());
    child.kill('SIGTERM');
    setTimeout(() => child.kill('SIGKILL'), 8_000).unref();
  });
}

async function runSuite(name) {
  const file = join(SUITES_DIR, `${name}.e2e.cjs`);
  const log = join(tmpdir(), `e2e-${name}.log`);
  const started = Date.now();

  execSync(RESET_CMD, {
    cwd: ROOT,
    env: {
      ...process.env,
      DATABASE_URL: DB_URL,
      SEED_DEMO_SCENARIOS: 'false',
    },
    stdio: 'pipe',
    shell: true,
  });

  const fd = openSync(log, 'w');
  const server = spawn(process.execPath, ['dist/main.js'], {
    cwd: ROOT,
    env: { ...process.env, ...BASE_ENV, ...SUITES[name] },
    stdio: ['ignore', fd, fd],
  });
  try {
    await waitReady(server, log);
    const result = spawnSync(process.execPath, [file], {
      cwd: ROOT,
      env: {
        ...process.env,
        E2E_BASE_URL: BASE_URL,
        E2E_DATABASE_URL: DB_URL,
        E2E_APP_LOG: log,
        E2E_RATE_PAUSE_MS: '0',
      },
      encoding: 'utf8',
      timeout: 300_000,
    });
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    const match = output.match(/(\d+) OK, (\d+) fallos/);
    const ok = match ? Number(match[1]) : 0;
    const failed = match ? Number(match[2]) : 1;
    return { name, ok, failed, crashed: !match, output, log, seconds: (Date.now() - started) / 1000 };
  } finally {
    await stop(server);
    closeSync(fd);
  }
}

async function main() {
  guard();
  const requested = process.argv.slice(2);
  const unknown = requested.filter((s) => !(s in SUITES));
  if (unknown.length) fail(`Suites desconocidas: ${unknown.join(', ')}. Disponibles: ${Object.keys(SUITES).join(', ')}`);
  const names = requested.length ? requested : Object.keys(SUITES);

  console.log(`Pruebas de punta a punta · ${names.length} suites · base ${new URL(DB_URL).pathname.slice(1)}\n`);
  const results = [];
  for (const name of names) {
    process.stdout.write(`  ${name.padEnd(15)} `);
    const r = await runSuite(name);
    results.push(r);
    const mark = r.failed || r.crashed ? '✘' : '✔';
    console.log(`${mark} ${String(r.ok).padStart(3)} OK  ${String(r.failed).padStart(2)} fallos  (${r.seconds.toFixed(0)} s)`);
    if (r.failed || r.crashed) {
      const lines = r.output.split('\n').filter((l) => l.startsWith('✘') || /Error|error:/.test(l));
      console.log(lines.slice(0, 15).map((l) => `      ${l}`).join('\n'));
      console.log(`      log del backend: ${r.log}`);
    }
  }
  const ok = results.reduce((s, r) => s + r.ok, 0);
  const failed = results.reduce((s, r) => s + r.failed, 0);
  console.log(`\n${failed ? '✘' : '✔'} Total: ${ok} OK, ${failed} fallos`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => fail(e.message));
