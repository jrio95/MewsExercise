/**
 * Copia a dist/ lo que tsc no toca:
 *  - src/data/eco.json, que se carga en runtime con createRequire.
 *  - la SPA compilada por Vite, que el servidor expone como estaticos.
 */
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(raiz, 'dist');

mkdirSync(dist, { recursive: true });
cpSync(join(raiz, 'src', 'data'), join(dist, 'data'), { recursive: true });
console.log('copiado: dist/data');

const web = join(raiz, '..', 'web', 'dist');
if (existsSync(web)) {
  cpSync(web, join(dist, 'public'), { recursive: true });
  console.log('copiado: dist/public');
} else {
  console.warn('aviso: no hay build de la web; el servidor solo expondra la API.');
}
