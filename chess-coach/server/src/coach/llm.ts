import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_API_KEY, COACH_MODEL } from '../config.js';
import type { InformePartida } from '../types.js';

let cliente: Anthropic | null = null;

export function coachDisponible(): boolean {
  return ANTHROPIC_API_KEY.length > 0;
}

/**
 * Narrativa opcional del entrenador.
 *
 * Todo el analisis duro lo hace Stockfish; el modelo solo redacta. Se le pasa
 * un resumen ya calculado y se le pide explicitamente que no invente jugadas ni
 * evaluaciones: si esta funcion falla o no hay clave, la aplicacion sigue
 * funcionando igual con las explicaciones deterministas.
 */
export async function narrarPartida(informe: InformePartida): Promise<string | null> {
  if (!coachDisponible()) return null;

  cliente ??= new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  const resumen = informe.resumen[informe.colorJugador];
  const color = informe.colorJugador === 'w' ? 'blancas' : 'negras';

  const fallos = informe.jugadas
    .filter((j) => j.color === informe.colorJugador && j.comentario)
    .slice(0, 12)
    .map((j) => `- ${j.numeroJugada}${j.color === 'w' ? '.' : '...'} ${j.san} [${j.calidad}] ${j.comentario}`)
    .join('\n');

  const datos = [
    `Jugador: ${color} (${informe.colorJugador === 'w' ? informe.blancas : informe.negras}). Resultado: ${informe.resultado}.`,
    `Apertura: ${informe.apertura ? `${informe.apertura.eco} ${informe.apertura.nombre}, teoria hasta el ply ${informe.apertura.plyLibro}` : 'no identificada'}.`,
    `Precision: ${resumen.precision}%. Errores graves: ${resumen.conteo.grave}, errores: ${resumen.conteo.error}, imprecisiones: ${resumen.conteo.imprecision}.`,
    `Perdida media por fase (centipeones): apertura ${resumen.perdidaPorFase.apertura.perdidaMedia}, medio juego ${resumen.perdidaPorFase.medio.perdidaMedia}, final ${resumen.perdidaPorFase.final.perdidaMedia}.`,
    `Habitos detectados: ${resumen.habitos.length ? resumen.habitos.join(', ') : 'ninguno'}.`,
    '',
    'Momentos clave detectados por el motor:',
    fallos || '(sin fallos destacables)',
  ].join('\n');

  try {
    const respuesta = await cliente.messages.create({
      model: COACH_MODEL,
      max_tokens: 700,
      system:
        'Eres un entrenador de ajedrez que escribe en espanol de Espana, en segunda persona y en tono directo y cercano. ' +
        'Recibes el analisis ya hecho por Stockfish: no inventes jugadas, variantes ni evaluaciones que no aparezcan en los datos, ' +
        'y no contradigas las evaluaciones que se te dan. Escribe entre 3 y 5 parrafos cortos: como fue la partida, ' +
        'cual fue el momento que la decidio, que patron deberia corregir el jugador y que entrenar esta semana. ' +
        'Nada de listas ni titulos: prosa seguida.',
      messages: [{ role: 'user', content: datos }],
    });

    const texto = respuesta.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    return texto || null;
  } catch (err) {
    // La narrativa es un extra: que falle no debe tumbar el analisis.
    console.error('[coach] no se pudo generar la narrativa:', err instanceof Error ? err.message : err);
    return null;
  }
}
