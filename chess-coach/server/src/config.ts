import { existsSync } from 'node:fs';
import { join } from 'node:path';

function firstExisting(paths: string[]): string | null {
  for (const p of paths) if (existsSync(p)) return p;
  return null;
}

/**
 * Ubicacion del binario de Stockfish. Debian/Ubuntu lo instalan en /usr/games,
 * que no siempre esta en el PATH del proceso, por eso probamos rutas conocidas
 * antes de rendirnos y confiar en el PATH.
 */
export const ENGINE_PATH =
  process.env.STOCKFISH_PATH ??
  firstExisting([
    '/usr/games/stockfish',
    '/usr/local/bin/stockfish',
    '/usr/bin/stockfish',
    '/opt/homebrew/bin/stockfish',
  ]) ??
  'stockfish';

export const PORT = Number(process.env.PORT ?? 8080);

/** Directorio persistente. En Railway se monta un volumen aqui. */
export const DATA_DIR = process.env.DATA_DIR ?? join(process.cwd(), '.data');

export const ENGINE_THREADS = Number(process.env.ENGINE_THREADS ?? 1);
export const ENGINE_HASH_MB = Number(process.env.ENGINE_HASH_MB ?? 64);

/** Profundidades permitidas por nivel de analisis. */
export const DEPTHS = { rapido: 14, normal: 17, profundo: 20 } as const;
export type Nivel = keyof typeof DEPTHS;

/** Tope de jugadas analizadas por partida (evita colgar el servidor). */
export const MAX_PLIES = Number(process.env.MAX_PLIES ?? 300);

/** Comentario narrado por IA: opcional, solo si hay clave. */
export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? '';
export const COACH_MODEL = process.env.COACH_MODEL ?? 'claude-sonnet-5';
