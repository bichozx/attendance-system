// Genera los tipos de la API desde el Swagger del backend.
// Las rutas quedan sin "/api/v1": el BFF (/api/backend) ya agrega ese prefijo.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const source = process.env.API_DOCS_URL ?? 'http://localhost:3000/api/docs-json';
const out = 'src/lib/api/schema.d.ts';
execSync(`npx openapi-typescript ${source} -o ${out}`, { stdio: 'inherit' });
writeFileSync(out, readFileSync(out, 'utf8').replaceAll('"/api/v1/', '"/'));
console.log('Rutas normalizadas (sin /api/v1).');
