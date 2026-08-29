/**
 * Compila los TSV de lichess-org/chess-openings a un unico JSON compacto.
 * Fuente: server/data-src/eco_{a..e}.tsv  ->  src/data/eco.json
 *
 * El JSON se indexa por la secuencia SAN normalizada ("e4 e5 Nf3"), que es
 * exactamente lo que produce chess.js al recorrer una partida, de modo que la
 * deteccion de apertura es una busqueda O(1) por prefijo.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, '..', 'data-src');
const outFile = join(here, '..', 'src', 'data', 'eco.json');

/** "1. Nh3 d5 2. g3" -> "Nh3 d5 g3" */
function toSanKey(pgn: string): string {
  return pgn
    .replace(/\d+\.(\.\.)?/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');
}

const book: Record<string, [string, string]> = {};
let rows = 0;

for (const file of readdirSync(srcDir).filter((f) => f.endsWith('.tsv')).sort()) {
  const lines = readFileSync(join(srcDir, file), 'utf8').split('\n');
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const [eco, name, pgn] = line.split('\t');
    if (!eco || !name || !pgn) continue;
    book[toSanKey(pgn)] = [eco, name];
    rows++;
  }
}

writeFileSync(outFile, JSON.stringify(book));
console.log(`eco.json: ${rows} aperturas, ${(JSON.stringify(book).length / 1024).toFixed(0)} KB`);
