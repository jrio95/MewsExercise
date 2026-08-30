import { randomUUID } from 'node:crypto';
import { Chess } from 'chess.js';
import { pool } from '../engine/pool.js';
import { DEPTHS, MAX_PLIES, type Nivel } from '../config.js';
import type {
  Calidad,
  Color,
  Fase,
  InformePartida,
  JugadaAnalizada,
  ResumenColor,
  Etiqueta,
} from '../types.js';
import {
  aPerspectivaBlancas,
  clamp,
  clasificar,
  cpDesde,
  media,
  precisionDeJugada,
  precisionGlobal,
  redondear,
  winPercent,
} from './scoring.js';
import { calcularFinApertura, faseDe } from './phases.js';
import { detectarApertura } from './openings.js';
import { describirUci, detectarHabitos, etiquetarJugada, lineaASan } from './tags.js';
import { explicarJugada, generarConsejos } from './explain.js';

const CALIDADES: Calidad[] = ['mejor', 'excelente', 'buena', 'imprecision', 'error', 'grave'];
const FASES: Fase[] = ['apertura', 'medio', 'final'];

/** Tope de perdida por jugada al agregar medias, en centipeones. */
const PERDIDA_CP_MAX = 1000;

export interface OpcionesAnalisis {
  pgn: string;
  nivel: Nivel;
  /** Color desde el que se ofrece el coaching. 'auto' lo deduce de las cabeceras. */
  colorJugador?: Color | 'auto';
  /** Nombre del usuario, para deducir su color cuando colorJugador es 'auto'. */
  nombreJugador?: string;
  onProgress?: (hecho: number, total: number) => void;
}

export class PgnInvalidoError extends Error {}

/**
 * Analiza una partida completa.
 *
 * Estrategia: se evalua cada posicion de la partida una sola vez (N+1
 * evaluaciones para N jugadas). La perdida de una jugada es la diferencia entre
 * la evaluacion de la posicion previa y la de la posicion resultante, ambas
 * llevadas al punto de vista de quien movio. Esto equivale a comparar contra la
 * mejor jugada del motor sin tener que evaluar cada alternativa por separado.
 */
export async function analizarPartida(opts: OpcionesAnalisis): Promise<InformePartida> {
  const profundidad = DEPTHS[opts.nivel];
  const { chess, cabeceras } = cargarPgn(opts.pgn);

  const historial = chess.history({ verbose: true });
  if (historial.length === 0) throw new PgnInvalidoError('El PGN no contiene jugadas.');
  if (historial.length > MAX_PLIES) {
    throw new PgnInvalidoError(`La partida tiene ${historial.length} medias jugadas; el maximo es ${MAX_PLIES}.`);
  }

  const sanes = historial.map((m) => m.san);
  const plyFinApertura = calcularFinApertura(sanes);
  const apertura = detectarApertura(sanes);

  // FEN de cada posicion: indice 0 = inicial, indice i = tras la jugada i.
  const fens: string[] = [historial[0]!.before];
  for (const m of historial) fens.push(m.after);

  let hechas = 0;
  const total = fens.length;
  const evaluaciones = await Promise.all(
    fens.map(async (fen) => {
      const r = await pool.analyse(fen, profundidad);
      opts.onProgress?.(++hechas, total);
      return r;
    }),
  );

  const colorJugador = resolverColor(opts, cabeceras);
  const jugadas: JugadaAnalizada[] = [];

  for (let i = 0; i < historial.length; i++) {
    const mv = historial[i]!;
    const ply = i + 1;
    const color = mv.color as Color;
    const antes = evaluaciones[i]!;
    const despues = evaluaciones[i + 1]!;

    const evalAntes = aPerspectivaBlancas(antes, color);
    const evalDespues = aPerspectivaBlancas(despues, color === 'w' ? 'b' : 'w');

    const cpAntes = cpDesde(evalAntes, color);
    const cpDespues = cpDesde(evalDespues, color);
    const uciJugado = `${mv.from}${mv.to}${mv.promotion ?? ''}`;
    const esLaDelMotor = antes.bestMove === uciJugado;

    // Si jugaste exactamente la jugada que recomienda el motor, la perdida es
    // cero por definicion. Hay que forzarlo: las dos posiciones se evaluan en
    // busquedas independientes a la misma profundidad, y el efecto horizonte
    // puede hacer que la evaluacion caiga aunque la jugada sea la mejor
    // (tipico en sacrificios, donde la compensacion aparece varios plies
    // despues). Sin esta regla, una combinacion correcta se penaliza como si
    // fuera un error.
    //
    // Topamos ademas la perdida en centipeones: un mate vale ~10000 cp y, sin
    // tope, una sola jugada distorsionaria todas las medias por fase. La caida
    // de probabilidad de victoria es la metrica fina; esta solo es informativa.
    const perdidaCp = esLaDelMotor ? 0 : clamp(cpAntes - cpDespues, 0, PERDIDA_CP_MAX);
    const perdidaWin = esLaDelMotor ? 0 : Math.max(0, winPercent(cpAntes) - winPercent(cpDespues));
    const calidad = clasificar(perdidaWin, esLaDelMotor);
    const fase = faseDe(mv.before, ply, plyFinApertura);

    const jugadaMotor = describirUci(mv.before, antes.bestMove);
    const respuestaRival = describirUci(mv.after, despues.bestMove);

    // Mates desde el punto de vista de quien movio. Partimos de las
    // evaluaciones ya normalizadas para no reintroducir el problema del -0.
    const signoJugador = color === 'w' ? 1 : -1;
    const mateAntes = evalAntes.mate === null ? null : evalAntes.mate * signoJugador;
    const mateDespues = evalDespues.mate === null ? null : evalDespues.mate * signoJugador;

    const etiquetas = etiquetarJugada({
      perdidaWin,
      mateAntes,
      mateDespues,
      jugadaMotor,
      jugadaJugada: { san: mv.san, captura: mv.captured ?? null, valorCaptura: 0, desde: mv.from, hasta: mv.to },
      respuestaRival,
      fase,
      fenAntes: mv.before,
      fenDespues: mv.after,
      color,
    });

    const base = {
      ply,
      numeroJugada: Math.ceil(ply / 2),
      color,
      san: mv.san,
      uci: uciJugado,
      fenAntes: mv.before,
      fenDespues: mv.after,
      evalAntes,
      evalDespues,
      perdidaCp: Math.round(perdidaCp),
      perdidaWin: redondear(perdidaWin),
      precision: redondear(precisionDeJugada(perdidaWin)),
      calidad,
      fase,
      mejorJugadaSan: jugadaMotor?.san ?? null,
      mejorJugadaUci: antes.bestMove,
      mejorLineaSan: lineaASan(mv.before, antes.pv),
      etiquetas,
    };

    jugadas.push({
      ...base,
      comentario: explicarJugada(base, respuestaRival?.san ?? null, respuestaRival?.hasta),
    });
  }

  const movimientosBasicos = historial.map((m) => ({
    color: m.color as Color,
    san: m.san,
    piece: m.piece,
    from: m.from,
    to: m.to,
    captured: m.captured,
  }));

  // Curva de probabilidad de victoria de toda la partida (punto de vista de las
  // blancas): la necesita el calculo de precision para pesar cada momento.
  const curvaWin = evaluaciones.map((r, i) =>
    winPercent(cpDesde(aPerspectivaBlancas(r, i % 2 === 0 ? 'w' : 'b'), 'w')),
  );

  const resumen = {
    w: construirResumen(jugadas, 'w', movimientosBasicos, curvaWin),
    b: construirResumen(jugadas, 'b', movimientosBasicos, curvaWin),
  } as Record<Color, ResumenColor>;

  const consejos = generarConsejos(
    resumen[colorJugador],
    jugadas.filter((j) => j.color === colorJugador),
    apertura?.consejo ?? null,
  );

  return {
    id: randomUUID(),
    creadoEn: new Date().toISOString(),
    nivel: opts.nivel,
    profundidad,
    cabeceras,
    blancas: cabeceras.White ?? 'Blancas',
    negras: cabeceras.Black ?? 'Negras',
    resultado: cabeceras.Result ?? '*',
    colorJugador,
    apertura,
    jugadas,
    resumen,
    consejos,
    narrativa: null,
    pgn: opts.pgn.trim(),
  };
}

function cargarPgn(pgn: string): { chess: Chess; cabeceras: Record<string, string> } {
  const chess = new Chess();
  try {
    chess.loadPgn(pgn, { strict: false });
  } catch (err) {
    throw new PgnInvalidoError(
      `No se pudo leer el PGN: ${err instanceof Error ? err.message : 'formato desconocido'}`,
    );
  }
  const crudas = chess.header() as Record<string, string | null>;
  const cabeceras: Record<string, string> = {};
  for (const [k, v] of Object.entries(crudas)) {
    if (v !== null && v !== '' && v !== '?' && v !== '????.??.??') cabeceras[k] = v;
  }
  return { chess, cabeceras };
}

/** Deduce de que color juega el usuario para orientar el coaching. */
function resolverColor(opts: OpcionesAnalisis, cabeceras: Record<string, string>): Color {
  if (opts.colorJugador === 'w' || opts.colorJugador === 'b') return opts.colorJugador;
  const nombre = opts.nombreJugador?.trim().toLowerCase();
  if (nombre) {
    if (cabeceras.White?.toLowerCase().includes(nombre)) return 'w';
    if (cabeceras.Black?.toLowerCase().includes(nombre)) return 'b';
  }
  return 'w';
}

function construirResumen(
  todas: JugadaAnalizada[],
  color: Color,
  movimientos: Parameters<typeof detectarHabitos>[0],
  curvaWin: number[],
): ResumenColor {
  const jugadas = todas.filter((j) => j.color === color);

  const conteo = Object.fromEntries(CALIDADES.map((c) => [c, 0])) as Record<Calidad, number>;
  for (const j of jugadas) conteo[j.calidad]++;

  const perdidaPorFase = Object.fromEntries(
    FASES.map((f) => {
      const deFase = jugadas.filter((j) => j.fase === f);
      return [f, { jugadas: deFase.length, perdidaMedia: redondear(media(deFase.map((j) => j.perdidaCp)), 0) }];
    }),
  ) as Record<Fase, { jugadas: number; perdidaMedia: number }>;

  const habitos = detectarHabitos(movimientos, color);

  const etiquetas: Partial<Record<Etiqueta, number>> = {};
  for (const j of jugadas) for (const t of j.etiquetas) etiquetas[t] = (etiquetas[t] ?? 0) + 1;
  for (const h of habitos) etiquetas[h] = (etiquetas[h] ?? 0) + 1;

  // La curva se recorta a las posiciones en las que le tocaba mover a este color.
  const curvaPropia = curvaWin.filter((_, i) => (color === 'w' ? i % 2 === 0 : i % 2 === 1));

  return {
    precision: redondear(precisionGlobal(jugadas.map((j) => j.precision), curvaPropia)),
    perdidaCpMedia: redondear(media(jugadas.map((j) => j.perdidaCp)), 0),
    conteo,
    perdidaPorFase,
    etiquetas,
    habitos,
  };
}
