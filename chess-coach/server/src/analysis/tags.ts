import { Chess } from 'chess.js';
import type { Color, Etiqueta, EtiquetaHabito, EtiquetaJugada } from '../types.js';

export const DESCRIPCIONES: Record<Etiqueta, string> = {
  mate_perdido: 'Tenias mate forzado y no lo viste',
  mate_permitido: 'Permitiste un mate forzado del rival',
  pieza_colgada: 'Dejaste una pieza sin defender y el rival la captura gratis',
  defensa_abandonada: 'Moviste la pieza que defendia otra, y el rival se lleva lo que quedo suelto',
  material_perdido: 'Habia una captura ganadora sobre el tablero y no la jugaste',
  error_apertura: 'Fallos en la apertura (primeras jugadas)',
  error_medio: 'Fallos en el medio juego',
  error_final: 'Fallos en el final',
  sin_enrocar: 'Dejas el rey sin enrocar demasiado tiempo',
  dama_temprana: 'Sacas la dama en las primeras jugadas',
  desarrollo_lento: 'Tardas en sacar caballos y alfiles',
  misma_pieza_repetida: 'Mueves la misma pieza varias veces en la apertura',
  peones_rey_debilitados: 'Avanzas peones delante de tu rey sin necesidad',
};

const VALOR_PIEZA: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export interface InfoJugadaUci {
  san: string;
  captura: string | null;
  valorCaptura: number;
  desde: string;
  hasta: string;
}

/** Traduce una jugada UCI ("e2e4", "e7e8q") a SAN sobre una posicion dada. */
export function describirUci(fen: string, uci: string | null): InfoJugadaUci | null {
  if (!uci || uci.length < 4) return null;
  const chess = new Chess(fen);
  const desde = uci.slice(0, 2);
  const hasta = uci.slice(2, 4);
  const promocion = uci.length > 4 ? uci[4] : undefined;
  try {
    const mv = chess.move({ from: desde, to: hasta, promotion: promocion });
    if (!mv) return null;
    return {
      san: mv.san,
      captura: mv.captured ?? null,
      valorCaptura: mv.captured ? (VALOR_PIEZA[mv.captured] ?? 0) : 0,
      desde,
      hasta,
    };
  } catch {
    return null;
  }
}

/** Convierte una linea principal UCI a SAN legible, hasta `max` medias jugadas. */
export function lineaASan(fen: string, pv: string[], max = 6): string[] {
  const chess = new Chess(fen);
  const out: string[] = [];
  for (const uci of pv.slice(0, max)) {
    const mv = describirUciEn(chess, uci);
    if (!mv) break;
    out.push(mv);
  }
  return out;
}

function describirUciEn(chess: Chess, uci: string): string | null {
  if (uci.length < 4) return null;
  try {
    const mv = chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length > 4 ? uci[4] : undefined,
    });
    return mv ? mv.san : null;
  } catch {
    return null;
  }
}

/** Nombre de la pieza para poder decirlo en una frase. */
export const NOMBRE_PIEZA: Record<string, string> = {
  p: 'peon',
  n: 'caballo',
  b: 'alfil',
  r: 'torre',
  q: 'dama',
  k: 'rey',
};

/**
 * ¿La jugada dejó sin defensa algo que antes sí estaba defendido?
 *
 * Es la razón concreta de una familia entera de errores: mover la pieza que
 * hacía de defensora. Se detecta comparando quién defiende la casilla antes y
 * después, y sólo cuenta si el rival efectivamente captura ahí.
 *
 * Se excluye la casilla de destino de la propia jugada: eso es colgar la pieza
 * que acabas de mover, que ya tiene su propia etiqueta.
 */
export function defensaAbandonada(
  fenAntes: string,
  fenDespues: string,
  casillaCapturada: string,
  destinoPropio: string,
  color: Color,
): { pieza: string; casilla: string } | null {
  if (casillaCapturada === destinoPropio) return null;

  try {
    const antes = new Chess(fenAntes);
    const despues = new Chess(fenDespues);

    const pieza = antes.get(casillaCapturada as never);
    // Tiene que ser una pieza nuestra que ya estaba ahí antes de mover.
    if (!pieza || pieza.color !== color) return null;
    if (despues.get(casillaCapturada as never)?.type !== pieza.type) return null;

    const defendidaAntes = antes.isAttacked(casillaCapturada as never, color);
    const defendidaDespues = despues.isAttacked(casillaCapturada as never, color);
    if (!defendidaAntes || defendidaDespues) return null;

    return { pieza: NOMBRE_PIEZA[pieza.type] ?? 'pieza', casilla: casillaCapturada };
  } catch {
    return null;
  }
}

export interface ContextoEtiquetas {
  perdidaWin: number;
  /** Evaluacion antes, en centipeones desde el punto de vista del que mueve. */
  mateAntes: number | null;
  /** Evaluacion despues, en centipeones desde el punto de vista del que movio. */
  mateDespues: number | null;
  jugadaMotor: InfoJugadaUci | null;
  jugadaJugada: InfoJugadaUci;
  respuestaRival: InfoJugadaUci | null;
  fase: 'apertura' | 'medio' | 'final';
  fenAntes: string;
  fenDespues: string;
  color: Color;
}

/**
 * Etiqueta los patrones de error de una jugada concreta.
 *
 * Todas las reglas exigen que la jugada sea al menos una imprecision: no tiene
 * sentido decir "colgaste una pieza" en una jugada que el motor aprueba.
 */
export function etiquetarJugada(ctx: ContextoEtiquetas): EtiquetaJugada[] {
  const tags: EtiquetaJugada[] = [];
  const { perdidaWin } = ctx;

  if (ctx.mateAntes !== null && ctx.mateAntes > 0 && !(ctx.mateDespues !== null && ctx.mateDespues > 0)) {
    tags.push('mate_perdido');
  }
  if (ctx.mateDespues !== null && ctx.mateDespues < 0 && !(ctx.mateAntes !== null && ctx.mateAntes < 0)) {
    tags.push('mate_permitido');
  }

  if (perdidaWin >= 10 && ctx.respuestaRival?.captura && ctx.respuestaRival.valorCaptura >= 3) {
    tags.push('pieza_colgada');
  }

  // Cubre lo que `pieza_colgada` deja fuera: perder un peon por haber movido a
  // su unico defensor. El valor es pequeno, pero la razon es igual de concreta.
  if (perdidaWin >= 5 && ctx.respuestaRival?.captura) {
    const abandonada = defensaAbandonada(
      ctx.fenAntes,
      ctx.fenDespues,
      ctx.respuestaRival.hasta,
      ctx.jugadaJugada.hasta,
      ctx.color,
    );
    if (abandonada) tags.push('defensa_abandonada');
  }

  if (
    perdidaWin >= 5 &&
    ctx.jugadaMotor?.captura &&
    ctx.jugadaMotor.valorCaptura >= 3 &&
    ctx.jugadaMotor.hasta !== ctx.jugadaJugada.hasta
  ) {
    tags.push('material_perdido');
  }

  if (perdidaWin >= 5) {
    tags.push(ctx.fase === 'apertura' ? 'error_apertura' : ctx.fase === 'medio' ? 'error_medio' : 'error_final');
  }

  return tags;
}

interface MovimientoBasico {
  color: Color;
  san: string;
  piece: string;
  from: string;
  to: string;
  captured?: string | undefined;
}

/**
 * Detecta habitos que solo se ven mirando la partida entera, no jugada a jugada.
 * Son los patrones que mas repite un jugador aficionado y los que mas rapido se
 * corrigen una vez identificados.
 */
export function detectarHabitos(movimientos: MovimientoBasico[], color: Color): EtiquetaHabito[] {
  const habitos: EtiquetaHabito[] = [];
  const propios = movimientos.filter((m) => m.color === color);
  if (propios.length === 0) return habitos;

  const enroco = propios.some((m) => m.san === 'O-O' || m.san === 'O-O-O');
  const plyDeEnroque = propios.findIndex((m) => m.san === 'O-O' || m.san === 'O-O-O');
  const primeras12 = propios.slice(0, 12);
  const primeras10 = propios.slice(0, 10);

  if (!enroco && propios.length >= 15) habitos.push('sin_enrocar');

  const damaTemprana = propios.slice(0, 4).some((m) => m.piece === 'q' && !m.captured);
  if (damaTemprana) habitos.push('dama_temprana');

  const menoresDesarrolladas = new Set(
    primeras12.filter((m) => m.piece === 'n' || m.piece === 'b').map((m) => m.from),
  );
  if (menoresDesarrolladas.size < 3) habitos.push('desarrollo_lento');

  // Seguimos la identidad de cada pieza encadenando from -> to.
  const vecesMovida = new Map<string, number>();
  const posiciones = new Map<string, string>(); // casilla actual -> id de pieza
  let siguienteId = 0;
  for (const m of primeras10) {
    const id = posiciones.get(m.from) ?? `p${siguienteId++}`;
    posiciones.delete(m.from);
    posiciones.set(m.to, id);
    vecesMovida.set(id, (vecesMovida.get(id) ?? 0) + 1);
  }
  if ([...vecesMovida.values()].some((v) => v >= 3)) habitos.push('misma_pieza_repetida');

  const limite = plyDeEnroque === -1 ? 12 : plyDeEnroque;
  const peonesDelRey = propios
    .slice(0, limite)
    .filter((m) => m.piece === 'p' && 'fgh'.includes(m.from[0] ?? '') && !m.captured);
  if (peonesDelRey.length >= 2) habitos.push('peones_rey_debilitados');

  return habitos;
}
