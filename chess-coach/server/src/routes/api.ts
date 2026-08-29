import { Router, type Request } from 'express';
import { z } from 'zod';
import { analizarPartida, PgnInvalidoError } from '../analysis/analyzeGame.js';
import { narrarPartida, coachDisponible } from '../coach/llm.js';
import {
  borrarPartida,
  calcularEstadisticas,
  cambiarColor,
  guardarPartida,
  listarPartidas,
  obtenerPartida,
} from '../db/games.js';
import { pool, poolSize } from '../engine/pool.js';
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
});

/**
 * Identidad del usuario.
 *
 * No hay login: el cliente genera un identificador y lo manda en una cabecera.
 * Es suficiente para que cada navegador tenga su propio historico y deja la
 * puerta abierta a sustituirlo por un usuario autenticado sin tocar el resto.
 */
function usuarioDe(req: Request): string {
  const cabecera = req.header('x-coach-user');
  if (cabecera && /^[A-Za-z0-9_-]{8,64}$/.test(cabecera)) return cabecera;
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

  const { pgn, nivel, colorJugador, nombreJugador, guardar, narrar } = parsed.data;

  try {
    const informe = await analizarPartida({ pgn, nivel, colorJugador, nombreJugador });

    if (narrar && coachDisponible()) {
      informe.narrativa = await narrarPartida(informe);
    }

    if (guardar) {
      guardarPartida(usuarioDe(req), informe);
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
