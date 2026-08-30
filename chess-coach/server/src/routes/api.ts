import { Router, type Request } from 'express';
import { z } from 'zod';
import { analizarPartida, PgnInvalidoError } from '../analysis/analyzeGame.js';
import { narrarPartida } from '../coach/llm.js';
import { CoachNoConfigurado, coachDisponible, explicarJugada } from '../coach/explicar.js';
import {
  borrarPartida,
  calcularEstadisticas,
  cambiarColor,
  guardarPartida,
  guardarPorQue,
  listarPartidas,
  obtenerPartida,
  yaImportadas,
} from '../db/games.js';
import { pool, poolSize } from '../engine/pool.js';
import { ChessComError, traerPartidas } from '../importar/chesscom.js';
import { DEPTHS } from '../config.js';

export const api = Router();

const MAX_PGN = 100_000;

const esquemaAnalisis = z.object({
  pgn: z.string().min(2).max(MAX_PGN),
  nivel: z.enum(['rapido', 'normal', 'profundo']).default('normal'),
  colorJugador: z.enum(['w', 'b', 'auto']).default('auto'),
  nombreJugador: z.string().max(120).optional(),
  guardar: z.boolean().default(true),
  narrar: z.boolean().default(false),
  /** Origen, cuando la partida llega importada y no pegada a mano. */
  fuente: z.string().max(32).optional(),
  fuenteId: z.string().max(300).optional(),
});

/**
 * Identidad del usuario.
 *
 * No hay login. Puede ser un identificador anonimo generado por el navegador o,
 * si ha conectado Chess.com, `cc-<usuario>`: asi el historico le sigue de un
 * dispositivo a otro sin contrasenas, que es lo que de verdad duele perder.
 *
 * El precio esta asumido y documentado: cualquiera que escriba ese nombre ve
 * ese historico. Son analisis de partidas ya publicas en Chess.com. El dia que
 * eso deje de bastar, este es el unico punto que hay que cambiar.
 */
function usuarioDe(req: Request): string {
  const cabecera = req.header('x-coach-user');
  if (cabecera && /^[A-Za-z0-9_-]{3,64}$/.test(cabecera)) return cabecera;
  return 'anonimo';
}

api.get('/salud', async (_req, res) => {
  const motorOk = await pool.healthy();
  res.status(motorOk ? 200 : 503).json({
    ok: motorOk,
    motor: motorOk ? pool.versionMotor : 'el motor no responde',
    procesos: poolSize,
    profundidades: DEPTHS,
    coachIa: coachDisponible(),
  });
});

api.post('/analizar', async (req, res) => {
  const parsed = esquemaAnalisis.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Peticion invalida', detalle: parsed.error.flatten() });
    return;
  }

  const { pgn, nivel, colorJugador, nombreJugador, guardar, narrar, fuente, fuenteId } = parsed.data;

  try {
    const informe = await analizarPartida({ pgn, nivel, colorJugador, nombreJugador });

    if (narrar && coachDisponible()) {
      informe.narrativa = await narrarPartida(informe);
    }

    if (guardar) {
      const origen = fuente && fuenteId ? { fuente, fuenteId } : undefined;
      guardarPartida(usuarioDe(req), informe, origen);
    }

    res.json(informe);
  } catch (err) {
    if (err instanceof PgnInvalidoError) {
      res.status(422).json({ error: err.message });
      return;
    }
    console.error('[api] fallo el analisis:', err);
    res.status(500).json({ error: 'No se pudo analizar la partida. Intentalo de nuevo.' });
  }
});

/**
 * Lista las ultimas partidas de un usuario de Chess.com, sin analizarlas.
 *
 * Analizar diez partidas lleva su tiempo, asi que primero se enseñan y el
 * usuario elige. Se marcan las que ya estan en su historico para no repetirlas.
 */
api.get('/chesscom/:usuario', async (req, res) => {
  const limite = Math.min(Math.max(Number(req.query.limite ?? 10) || 10, 1), 50);

  try {
    const partidas = await traerPartidas(req.params.usuario, limite);
    const conocidas = yaImportadas(
      usuarioDe(req),
      partidas.map((p) => p.fuenteId),
    );

    res.json(
      partidas.map((p) => ({ ...p, yaAnalizada: conocidas.has(p.fuenteId) })),
    );
  } catch (err) {
    if (err instanceof ChessComError) {
      res.status(err.estado).json({ error: err.message });
      return;
    }
    // Un cambio en el formato de su API cae aqui: mejor decirlo que fingir.
    console.error('[api] fallo la importacion de Chess.com:', err);
    res.status(502).json({
      error: 'Chess.com ha devuelto algo que no se entiende. Puede que hayan cambiado su API.',
    });
  }
});

api.get('/partidas', (req, res) => {
  const limite = Math.min(Number(req.query.limite ?? 50) || 50, 200);
  const desplazamiento = Math.max(Number(req.query.desde ?? 0) || 0, 0);
  res.json(listarPartidas(usuarioDe(req), limite, desplazamiento));
});

api.get('/partidas/:id', (req, res) => {
  const informe = obtenerPartida(usuarioDe(req), req.params.id);
  if (!informe) {
    res.status(404).json({ error: 'Partida no encontrada' });
    return;
  }
  res.json(informe);
});

const esquemaPorQue = z.object({ ply: z.number().int().positive() });

/**
 * Explica una jugada concreta con razonamiento del modelo.
 *
 * Va bajo demanda y no dentro del analisis: cada explicacion es una llamada de
 * pago, y el usuario solo quiere el "por que" de las jugadas que le interesan.
 * La respuesta queda cacheada en el informe.
 */
api.post('/partidas/:id/por-que', async (req, res) => {
  const parsed = esquemaPorQue.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Falta el numero de media jugada.' });
    return;
  }

  const usuario = usuarioDe(req);
  const informe = obtenerPartida(usuario, req.params.id);
  if (!informe) {
    res.status(404).json({ error: 'Partida no encontrada' });
    return;
  }

  const jugada = informe.jugadas.find((j) => j.ply === parsed.data.ply);
  if (!jugada) {
    res.status(404).json({ error: 'Jugada no encontrada' });
    return;
  }

  if (jugada.porQue) {
    res.json({ porQue: jugada.porQue, cacheada: true });
    return;
  }

  try {
    const porQue = await explicarJugada(informe, jugada);
    guardarPorQue(usuario, req.params.id, jugada.ply, porQue);
    res.json({ porQue, cacheada: false });
  } catch (err) {
    if (err instanceof CoachNoConfigurado) {
      res.status(503).json({ error: 'El entrenador con IA no esta configurado en este servidor.' });
      return;
    }
    console.error('[api] fallo la explicacion:', err);
    res.status(502).json({ error: 'No se pudo generar la explicacion. Intentalo de nuevo.' });
  }
});

const esquemaColor = z.object({ colorJugador: z.enum(['w', 'b']) });

/** Corrige el bando de una partida ya guardada, sin volver a analizarla. */
api.patch('/partidas/:id/color', (req, res) => {
  const parsed = esquemaColor.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Color invalido' });
    return;
  }

  const informe = cambiarColor(usuarioDe(req), req.params.id, parsed.data.colorJugador);
  if (!informe) {
    res.status(404).json({ error: 'Partida no encontrada' });
    return;
  }
  res.json(informe);
});

api.delete('/partidas/:id', (req, res) => {
  const borrada = borrarPartida(usuarioDe(req), req.params.id);
  res.status(borrada ? 204 : 404).end();
});

api.get('/estadisticas', (req, res) => {
  res.json(calcularEstadisticas(usuarioDe(req)));
});
