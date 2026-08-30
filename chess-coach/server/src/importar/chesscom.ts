import { z } from 'zod';
import { Chess } from 'chess.js';
import type { Color } from '../types.js';

const BASE = 'https://api.chess.com/pub';

/** Chess.com rechaza las peticiones sin User-Agent identificable. */
const USER_AGENT =
  process.env.CHESSCOM_USER_AGENT ??
  'chess-coach/0.1 (analizador personal de partidas; +https://github.com/jrio95/MewsExercise)';

const TIEMPO_MAXIMO_MS = 15_000;

/**
 * Del JSON de Chess.com solo se exige lo imprescindible.
 *
 * Todo lo demas (jugadores, resultado, fecha, control de tiempo) se saca del
 * propio PGN, que es un formato estandar y estable. Asi un cambio en su API
 * solo puede romper la importacion si desaparece el campo `pgn`, en lugar de
 * romperla cada vez que anaden o renombran una clave.
 */
const esquemaArchivos = z.object({ archives: z.array(z.string().url()) });
const esquemaMes = z.object({
  games: z.array(z.object({ pgn: z.string().optional() }).passthrough()),
});

export class ChessComError extends Error {
  constructor(
    message: string,
    readonly estado: number,
  ) {
    super(message);
  }
}

async function pedirJson(url: string): Promise<unknown> {
  const corte = AbortSignal.timeout(TIEMPO_MAXIMO_MS);
  let respuesta: Response;

  try {
    respuesta = await fetch(url, { headers: { 'user-agent': USER_AGENT }, signal: corte });
  } catch (err) {
    const motivo = err instanceof Error && err.name === 'TimeoutError' ? 'tardo demasiado' : 'no responde';
    throw new ChessComError(`Chess.com ${motivo}. Intentalo de nuevo en un momento.`, 504);
  }

  if (respuesta.status === 404) {
    throw new ChessComError('Ese usuario no existe en Chess.com. Revisa como lo has escrito.', 404);
  }
  if (respuesta.status === 429) {
    throw new ChessComError('Chess.com esta limitando las peticiones. Espera un minuto.', 429);
  }
  if (!respuesta.ok) {
    throw new ChessComError(`Chess.com devolvio un error (${respuesta.status}).`, 502);
  }

  return respuesta.json();
}

/** Metadatos de una partida, leidos del PGN y no del JSON de Chess.com. */
export interface PartidaImportada {
  /** Identificador estable para no reanalizar la misma partida. */
  fuenteId: string;
  pgn: string;
  fecha: string | null;
  blancas: string;
  negras: string;
  resultado: string;
  /** Color del usuario que se ha importado, deducido de las cabeceras. */
  tuColor: Color | null;
  rival: string;
  eloRival: string | null;
  controlTiempo: string | null;
  enlace: string | null;
}

/**
 * Extrae de un PGN lo que hace falta para listar la partida.
 *
 * El identificador sale del enlace de Chess.com si viene; si no, de la propia
 * notacion, que identifica una partida de forma unica en la practica.
 */
export function describirPgn(pgn: string, usuario: string): PartidaImportada | null {
  const chess = new Chess();
  try {
    chess.loadPgn(pgn, { strict: false });
  } catch {
    return null;
  }
  if (chess.history().length === 0) return null;

  const cab = chess.header() as Record<string, string | null>;
  const blancas = cab.White ?? '?';
  const negras = cab.Black ?? '?';
  const buscado = usuario.trim().toLowerCase();

  const tuColor: Color | null =
    blancas.toLowerCase() === buscado ? 'w' : negras.toLowerCase() === buscado ? 'b' : null;

  const enlace = cab.Link ?? null;

  return {
    fuenteId: enlace ?? `pgn:${huella(chess.history().join(' ') + blancas + negras + (cab.Date ?? ''))}`,
    pgn,
    fecha: cab.UTCDate ?? cab.Date ?? null,
    blancas,
    negras,
    resultado: cab.Result ?? '*',
    tuColor,
    rival: tuColor === 'w' ? negras : tuColor === 'b' ? blancas : `${blancas} vs ${negras}`,
    eloRival: (tuColor === 'w' ? cab.BlackElo : tuColor === 'b' ? cab.WhiteElo : null) ?? null,
    controlTiempo: cab.TimeControl ?? null,
    enlace,
  };
}

/** Huella corta y estable de una cadena; suficiente para distinguir partidas. */
function huella(texto: string): string {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

const USUARIO_VALIDO = /^[A-Za-z0-9_-]{3,25}$/;

/**
 * Trae las ultimas partidas de un usuario de Chess.com.
 *
 * Sus partidas estan agrupadas por mes, asi que se recorren los archivos de
 * mas reciente a mas antiguo y se para en cuanto hay suficientes: bajar el
 * historial entero de alguien que lleva años jugando seria absurdo.
 */
export async function traerPartidas(usuario: string, limite: number): Promise<PartidaImportada[]> {
  if (!USUARIO_VALIDO.test(usuario)) {
    throw new ChessComError('Nombre de usuario de Chess.com no valido.', 400);
  }

  const archivos = esquemaArchivos.parse(
    await pedirJson(`${BASE}/player/${encodeURIComponent(usuario)}/games/archives`),
  ).archives;

  if (archivos.length === 0) return [];

  const salida: PartidaImportada[] = [];
  // Como mucho seis meses hacia atras: si en medio año no ha jugado lo pedido,
  // seguir bajando meses vacios no aporta nada.
  for (const url of archivos.slice(-6).reverse()) {
    const mes = esquemaMes.parse(await pedirJson(url));

    // Dentro del mes vienen de mas antigua a mas reciente.
    for (const partida of [...mes.games].reverse()) {
      if (!partida.pgn) continue;
      const descrita = describirPgn(partida.pgn, usuario);
      if (descrita) salida.push(descrita);
      if (salida.length >= limite) return salida;
    }
  }

  return salida;
}
