// Quita de node_modules lo que solo sirve para desarrollo aunque cuelgue de una dependencia de
// producción. Caso real: @prisma/client declara como "peer" a la CLI `prisma` (y esta arrastra
// Prisma Studio, una base PGlite, React...) y a `typescript`. pnpm las conserva tras
// `pnpm prune --prod`, pero la API en ejecución no las usa: el cliente ya está generado.
//
// Uso (después de `pnpm prune --prod`, en la imagen Docker):  node scripts/prune-runtime-deps.cjs
// Con --dry-run solo informa.
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

/** Ramas que no se recorren: herramientas de desarrollo enganchadas como "peer". */
const SKIP = new Set(['prisma', 'typescript']);
const dryRun = process.argv.includes('--dry-run');
const root = process.cwd();
const store = path.join(root, 'node_modules', '.pnpm');

const tree = JSON.parse(
  execSync('pnpm list --prod --json --depth Infinity', {
    cwd: root,
    maxBuffer: 256 * 1024 * 1024,
    encoding: 'utf8',
  }),
)[0];

// Carpeta de .pnpm a la que pertenece cada paquete alcanzable desde las dependencias de producción
const keep = new Set();
const seen = new Set();
const visit = (deps) => {
  for (const [name, dep] of Object.entries(deps ?? {})) {
    if (SKIP.has(name) || !dep.path) continue;
    const key = `${dep.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const rel = path.relative(store, dep.path);
    if (!rel.startsWith('..')) keep.add(rel.split(path.sep)[0]);
    visit(dep.dependencies);
  }
};
visit(tree.dependencies);

let freed = 0;
const removed = [];
const size = (p) => {
  let total = 0;
  for (const e of fs.readdirSync(p, { withFileTypes: true })) {
    const full = path.join(p, e.name);
    if (e.isSymbolicLink()) continue;
    total += e.isDirectory() ? size(full) : fs.statSync(full).size;
  }
  return total;
};
for (const dir of fs.readdirSync(store)) {
  if (dir === 'node_modules' || dir.startsWith('lock.') || keep.has(dir))
    continue;
  const full = path.join(store, dir);
  if (!fs.statSync(full).isDirectory()) continue;
  freed += size(full);
  removed.push(dir);
  if (!dryRun) fs.rmSync(full, { recursive: true, force: true });
}

// Enlaces que quedaron apuntando a carpetas borradas (en node_modules/ y en .pnpm/node_modules/)
const dropDangling = (dir) => {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.name.startsWith('@') && e.isDirectory()) dropDangling(full);
    else if (e.isSymbolicLink() && !fs.existsSync(full) && !dryRun)
      fs.unlinkSync(full);
  }
};
dropDangling(path.join(root, 'node_modules'));
dropDangling(path.join(store, 'node_modules'));
for (const dir of keep) dropDangling(path.join(store, dir, 'node_modules'));

console.log(
  `${dryRun ? '[simulación] ' : ''}${removed.length} paquetes fuera de la imagen, ` +
    `${(freed / 1024 / 1024).toFixed(0)} MB liberados.`,
);
