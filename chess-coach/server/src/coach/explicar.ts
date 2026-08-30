import Anthropic from '@anthropic-ai/sdk';
import { Chess } from 'chess.js';
import { ANTHROPIC_API_KEY, COACH_MODEL } from '../config.js';
import type { InformePartida, JugadaAnalizada } from '../types.js';

let cliente: Anthropic | null = null;

export function coachDisponible(): boolean {
  return ANTHROPIC_API_KEY.length > 0;
}

/** Cliente compartido: crearlo por peticion tiraria la reutilizacion de conexiones. */
export function clienteAnthropic(): Anthropic {
  cliente ??= new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  return cliente;
}

const SISTEMA = `Eres un entrenador de ajedrez que explica partidas a un jugador aficionado, en espanol de Espana, tuteandole y sin rodeos.

Recibes datos ya calculados por Stockfish sobre UNA jugada concreta. Tu unico trabajo es explicar POR QUE: que problema tiene la jugada que se hizo, o que consigue la que recomienda el motor. El jugador ya ve en pantalla la evaluacion y cual era la mejor jugada; repetirselo no le aporta nada.

Reglas estrictas:
- No inventes jugadas, variantes ni evaluaciones. Usa solo las que aparecen en los datos.
- No contradigas la evaluacion del motor: es la verdad de referencia.
- Habla de piezas y casillas concretas ("el alfil de h3 se queda sin defensa", "la torre de f1 queda colgando"), no de ideas vagas.
- Si la razon es tactica, di la tactica: se pierde material, hay una clavada, una horquilla, un peon envenenado, el rey queda expuesto.
- Si es posicional, di el concepto: estructura de peones, casilla debil, columna abierta, pareja de alfiles, tiempos de desarrollo.
- Entre 2 y 4 frases. Sin listas, sin titulos, sin repetir la notacion completa de la partida.
- Si con los datos no puedes dar una razon concreta, dilo en una frase en lugar de rellenar con generalidades.`;

/** Material no peonil de cada bando, util para hablar de compensacion. */
function material(fen: string): string {
  const valor: Record<string, number> = { q: 9, r: 5, b: 3, n: 3, p: 1 };
  let blancas = 0;
  let negras = 0;
  for (const ch of fen.split(' ')[0] ?? '') {
    const v = valor[ch.toLowerCase()];
    if (v === undefined) continue;
    if (ch === ch.toUpperCase()) blancas += v;
    else negras += v;
  }
  return `blancas ${blancas}, negras ${negras}`;
}

/** Piezas del bando indicado que ningun compañero defiende. */
export function sinDefensa(fen: string, color: 'w' | 'b'): string {
  try {
    const chess = new Chess(fen);
    const sueltas: string[] = [];

    for (const fila of chess.board()) {
      for (const casilla of fila) {
        if (!casilla || casilla.color !== color || casilla.type === 'k') continue;
        // isAttacked(casilla, color) responde: ¿la defiende alguien de su bando?
        if (!chess.isAttacked(casilla.square, color)) {
          sueltas.push(`${casilla.type.toUpperCase()}${casilla.square}`);
        }
      }
    }
    return sueltas.length > 0 ? sueltas.join(', ') : 'ninguna';
  } catch {
    return 'no calculable';
  }
}

function enPeones(cp: number | null, mate: number | null): string {
  if (mate !== null) return `mate en ${Math.abs(mate)} para las ${mate > 0 ? 'blancas' : 'negras'}`;
  if (cp === null) return 'desconocida';
  return `${(cp / 100).toFixed(2)} (positivo favorece a las blancas)`;
}

/** Reúne los hechos del motor que sostienen la explicación. */
export function construirDatos(informe: InformePartida, j: JugadaAnalizada): string {
  const mueve = j.color === 'w' ? 'blancas' : 'negras';
  const rival = j.color === 'w' ? 'negras' : 'blancas';

  return [
    `Posicion antes de la jugada (FEN): ${j.fenAntes}`,
    `Mueven las ${mueve}. Es la jugada ${j.numeroJugada}. Fase: ${j.fase}.`,
    `Material sobre el tablero: ${material(j.fenAntes)}.`,
    `Piezas de las ${mueve} sin defensa antes de mover: ${sinDefensa(j.fenAntes, j.color)}.`,
    '',
    `JUGADA REALIZADA: ${j.san}. Calificacion del motor: ${j.calidad}.`,
    `Evaluacion antes: ${enPeones(j.evalAntes.cp, j.evalAntes.mate)}.`,
    `Evaluacion despues: ${enPeones(j.evalDespues.cp, j.evalDespues.mate)}.`,
    `Coste de la jugada: ${j.perdidaCp} centipeones (${j.perdidaWin} puntos de probabilidad de victoria).`,
    `Piezas de las ${mueve} que quedan sin defensa despues de mover: ${sinDefensa(j.fenDespues, j.color)}.`,
    '',
    j.mejorJugadaSan
      ? `JUGADA RECOMENDADA POR EL MOTOR: ${j.mejorJugadaSan}.`
      : 'El motor no propone alternativa.',
    j.mejorLineaSan.length > 0
      ? `Continuacion que da el motor tras esa jugada: ${j.mejorLineaSan.join(' ')}.`
      : '',
    j.etiquetas.length > 0 ? `Patrones detectados automaticamente: ${j.etiquetas.join(', ')}.` : '',
    '',
    `Contexto de la partida: apertura ${informe.apertura ? `${informe.apertura.eco} ${informe.apertura.nombre}` : 'no identificada'}, resultado final ${informe.resultado}. El jugador al que entrenas lleva las ${informe.colorJugador === 'w' ? 'blancas' : 'negras'}.`,
    '',
    `Explica por que ${j.san} es "${j.calidad}" y que consigue la alternativa del motor. Recuerda: el jugador ya sabe la evaluacion y cual era la mejor jugada; quiere entender el motivo. Habla de las ${rival} como "tu rival" solo si el jugador entrenado lleva las ${mueve}.`,
  ]
    .filter(Boolean)
    .join('\n');
}

export class CoachNoConfigurado extends Error {}

/**
 * Explica una jugada concreta con razonamiento del modelo.
 *
 * El analisis duro sigue siendo de Stockfish: aqui solo se traduce a un "por
 * que". El modelo recibe unicamente hechos verificables (FEN, evaluaciones,
 * mejor jugada, linea principal, piezas sin defensa) y tiene prohibido inventar
 * variantes, de modo que no puede contradecir al motor.
 */
export async function explicarJugada(informe: InformePartida, j: JugadaAnalizada): Promise<string> {
  if (!coachDisponible()) {
    throw new CoachNoConfigurado('No hay ANTHROPIC_API_KEY configurada.');
  }

  const respuesta = await clienteAnthropic().beta.messages.create({
    model: COACH_MODEL,
    max_tokens: 8000,
    // Entender por que una jugada falla es justo un problema de razonamiento:
    // el pensamiento adaptativo es lo que separa esta explicacion de repetir
    // los numeros que el usuario ya tiene delante.
    thinking: { type: 'adaptive' },
    // Si un clasificador rechazara la peticion, el servidor reintenta solo.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: [{ type: 'text', text: SISTEMA, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: construirDatos(informe, j) }],
  });

  const texto = respuesta.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();

  if (!texto) throw new Error('El modelo no devolvio ninguna explicacion.');
  return texto;
}
