#!/usr/bin/env node
/**
 * Restablece la contraseña de una cuenta directamente en la base (soporte / desarrollo).
 * También la desbloquea y cierra sus sesiones abiertas.
 *
 *   node scripts/reset-password.cjs admin@demo.local NuevaClave2026
 *   node scripts/reset-password.cjs admin@demo.local NuevaClave2026 --temporal   (pide cambiarla al entrar)
 *
 * Usa DATABASE_URL del entorno o del archivo .env del backend.
 */
require('dotenv/config');
const { Client } = require('pg');
const { hash } = require('@node-rs/argon2');

(async () => {
  const [email, password] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const temporary = process.argv.includes('--temporal');
  if (!email || !password) {
    console.error('Uso: node scripts/reset-password.cjs <correo> <contraseña nueva> [--temporal]');
    process.exit(2);
  }
  // Misma regla que la API: 8+ caracteres, al menos una letra y un número
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    console.error('La contraseña debe tener mínimo 8 caracteres, con al menos una letra y un número.');
    process.exit(2);
  }
  if (!process.env.DATABASE_URL) {
    console.error('Falta DATABASE_URL (en el entorno o en backend/.env).');
    process.exit(2);
  }

  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    const { rows } = await db.query(
      `UPDATE users
          SET "passwordHash" = $2, "failedLoginAttempts" = 0, "lockedUntil" = NULL,
              status = CASE WHEN status = 'LOCKED' THEN 'ACTIVE'::"UserStatus" ELSE status END,
              "mustChangePassword" = $3, "updatedAt" = now()
        WHERE lower(email) = lower($1)
        RETURNING id, email, status`,
      [email.trim(), await hash(password), temporary],
    );
    if (!rows.length) {
      console.error(`No existe una cuenta con el correo ${email}. ¿Corriste el seed en esta base?`);
      process.exit(1);
    }
    const { rowCount } = await db.query(
      `UPDATE sessions SET "revokedAt" = now() WHERE "userId" = $1 AND "revokedAt" IS NULL`,
      [rows[0].id],
    );
    const memberships = (
      await db.query(
        `SELECT c.name, m.status AS membership, c.status AS company
           FROM company_memberships m JOIN companies c ON c.id = m."companyId"
          WHERE m."userId" = $1`,
        [rows[0].id],
      )
    ).rows;
    const host = new URL(process.env.DATABASE_URL).host;
    console.log(`✔ Contraseña restablecida para ${rows[0].email} (base en ${host}).`);
    console.log(`  Cuenta: ${rows[0].status} · sesiones cerradas: ${rowCount}${temporary ? ' · deberá cambiarla al entrar' : ''}`);
    for (const m of memberships) console.log(`  Empresa: ${m.name} · acceso ${m.membership} · empresa ${m.company}`);
    if (!memberships.length) console.log('  ⚠ No pertenece a ninguna empresa (solo sirve si es superadministrador).');
  } finally {
    await db.end();
  }
})().catch((e) => {
  console.error('✖', e.message);
  process.exit(1);
});
