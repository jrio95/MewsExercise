import { createRequire } from 'node:module';
import type { Apertura } from '../types.js';

const require = createRequire(import.meta.url);
/** eco.json: { "e4 e5 Nf3": ["C40", "King's Knight Opening"] } — 3810 entradas. */
const libro = require('../data/eco.json') as Record<string, [string, string]>;

/**
 * Identifica la apertura recorriendo la partida jugada a jugada y quedandose
 * con la coincidencia mas larga del libro. El ply en que deja de haber
 * coincidencia es el momento en que el jugador se salio de teoria.
 */
export function detectarApertura(sanes: string[]): Apertura | null {
  let mejor: { eco: string; nombre: string; ply: number } | null = null;
  const clave: string[] = [];

  for (let i = 0; i < Math.min(sanes.length, 40); i++) {
    clave.push(sanes[i]!);
    const hit = libro[clave.join(' ')];
    if (hit) mejor = { eco: hit[0], nombre: hit[1], ply: i + 1 };
  }

  if (!mejor) return null;

  return {
    eco: mejor.eco,
    nombre: mejor.nombre,
    plyLibro: mejor.ply,
    primeraFueraDeLibro: sanes[mejor.ply] ?? null,
    consejo: consejoApertura(mejor.ply, mejor.nombre),
  };
}

function consejoApertura(plyLibro: number, nombre: string): string {
  if (plyLibro <= 4) {
    return `Saliste de teoria muy pronto (jugada ${Math.ceil(plyLibro / 2)}). En ${nombre} merece la pena memorizar al menos 6-8 jugadas: te ahorra pensar en posiciones ya resueltas y llegas al medio juego con mejor estructura.`;
  }
  if (plyLibro <= 10) {
    return `Seguiste la teoria de ${nombre} hasta la jugada ${Math.ceil(plyLibro / 2)}. Es una base razonable; el siguiente paso es entender el plan tipico de la posicion, no solo las jugadas.`;
  }
  return `Buen conocimiento de ${nombre}: llegaste a la jugada ${Math.ceil(plyLibro / 2)} dentro de teoria. A partir de ahi lo que decide es el plan, no la memoria.`;
}

/** Principios generales para cuando no hay libro que aplicar. */
export const PRINCIPIOS_APERTURA = [
  'Ocupa el centro con peones (e4/d4 o e5/d5).',
  'Saca caballos y alfiles antes de mover dos veces la misma pieza.',
  'Enroca dentro de las primeras 10 jugadas.',
  'No saques la dama pronto: es facil de hostigar y pierdes tiempos.',
  'Conecta las torres antes de empezar operaciones en un flanco.',
];
