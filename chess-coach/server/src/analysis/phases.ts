import { Chess } from 'chess.js';
import type { Fase } from '../types.js';

const VALOR: Record<string, number> = { q: 9, r: 5, b: 3, n: 3, p: 0, k: 0 };

/** Material no peonil de ambos bandos en una posicion. */
export function materialNoPeonil(fen: string): number {
  const piezas = fen.split(' ')[0] ?? '';
  let total = 0;
  for (const ch of piezas) {
    const v = VALOR[ch.toLowerCase()];
    if (v !== undefined) total += v;
  }
  return total;
}

/**
 * Fase de la partida en una posicion dada.
 *
 * - apertura: hasta que ambos bandos han desarrollado, con tope en el ply 24.
 * - final: cuando queda poco material pesado (<= 14 puntos entre los dos, que
 *   equivale aproximadamente a dama+torre por bando o menos).
 * - medio: el resto.
 */
export function faseDe(fen: string, ply: number, plyFinApertura: number): Fase {
  if (materialNoPeonil(fen) <= 14) return 'final';
  if (ply <= plyFinApertura) return 'apertura';
  return 'medio';
}

/**
 * Calcula donde acaba la apertura: cuando ambos bandos han sacado al menos 3
 * piezas menores/enrocado, o como muy tarde en el ply 24.
 */
export function calcularFinApertura(sanes: string[]): number {
  const chess = new Chess();
  const desarrolladas: Record<'w' | 'b', Set<string>> = { w: new Set(), b: new Set() };

  for (let i = 0; i < sanes.length && i < 30; i++) {
    const mv = chess.move(sanes[i]!);
    if (!mv) break;
    if (mv.piece === 'n' || mv.piece === 'b') desarrolladas[mv.color].add(mv.to);
    if (mv.san === 'O-O' || mv.san === 'O-O-O') desarrolladas[mv.color].add('roque');
    if (desarrolladas.w.size >= 3 && desarrolladas.b.size >= 3) return Math.min(i + 1, 24);
  }
  return Math.min(sanes.length, 24);
}
