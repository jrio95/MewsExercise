import type { Calidad, Evaluacion } from '../types.js';
import type { AnalysisResult } from '../engine/uci.js';

/** Valor con el que topamos las evaluaciones para que un mate no rompa las medias. */
export const CP_MATE = 10_000;
const CP_CLAMP = 1000;

/**
 * Convierte el resultado del motor (siempre relativo al bando que mueve) a una
 * evaluacion absoluta desde el punto de vista de las blancas.
 */
export function aPerspectivaBlancas(r: AnalysisResult, mueven: 'w' | 'b'): Evaluacion {
  const signo = mueven === 'w' ? 1 : -1;

  // `score mate 0` significa que el bando que mueve ya esta mateado sobre el
  // tablero. Como el cero no tiene signo, multiplicarlo por la perspectiva da
  // -0 y la posicion se leeria como mate a favor del bando equivocado: hay que
  // convertirlo explicitamente en "mate en contra del que mueve".
  if (r.mate === 0) {
    return { cp: null, mate: mueven === 'w' ? -1 : 1 };
  }

  return {
    cp: r.cp === null ? null : r.cp * signo,
    mate: r.mate === null ? null : r.mate * signo,
  };
}

/** Evaluacion en centipeones desde el punto de vista de un color, con mate saturado. */
export function cpDesde(ev: Evaluacion, color: 'w' | 'b'): number {
  const signo = color === 'w' ? 1 : -1;
  if (ev.mate !== null) {
    // Un mate mas corto vale mas, pero todos quedan muy por encima de cualquier ventaja material.
    const magnitud = CP_MATE - Math.min(Math.abs(ev.mate), 40) * 100;
    return (ev.mate > 0 ? magnitud : -magnitud) * signo;
  }
  if (ev.cp === null) return 0;
  return clamp(ev.cp * signo, -CP_CLAMP, CP_CLAMP);
}

/**
 * Probabilidad de victoria (0-100) a partir de la ventaja en centipeones.
 * Curva logistica de Lichess, calibrada sobre millones de partidas reales.
 */
export function winPercent(cp: number): number {
  if (cp >= CP_MATE - 4000) return 100;
  if (cp <= -(CP_MATE - 4000)) return 0;
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * clamp(cp, -CP_CLAMP, CP_CLAMP))) - 1);
}

/**
 * Precision de una jugada (0-100) a partir de la caida en probabilidad de
 * victoria. Misma formula que usa Lichess en su informe de partida.
 */
export function precisionDeJugada(perdidaWin: number): number {
  return clamp(103.1668 * Math.exp(-0.04354 * perdidaWin) - 3.1669, 0, 100);
}

/**
 * Clasifica una jugada.
 *
 * Trabajamos sobre la caida de probabilidad de victoria y no sobre los
 * centipeones crudos: perder 200 cp cuando ya ibas +900 es irrelevante, pero
 * perder 200 cp en una posicion igualada decide la partida.
 */
export function clasificar(perdidaWin: number, esLaDelMotor: boolean): Calidad {
  if (esLaDelMotor) return 'mejor';
  if (perdidaWin >= 20) return 'grave';
  if (perdidaWin >= 10) return 'error';
  if (perdidaWin >= 5) return 'imprecision';
  if (perdidaWin >= 2) return 'buena';
  return 'excelente';
}

/**
 * Precision global de un jugador en una partida (0-100).
 *
 * La media aritmetica simple infla el resultado: en una partida de 40 jugadas,
 * 35 jugadas obvias al 99% tapan las 5 que decidieron el resultado. Usamos el
 * mismo esquema que Lichess, que promedia dos medidas complementarias:
 *
 *  - Media ponderada por volatilidad: pesa mas los momentos en que la partida
 *    estaba realmente en juego (la evaluacion oscilaba) que las fases estables.
 *  - Media armonica: penaliza con dureza los valores bajos aislados, de forma
 *    que un error grave no se diluye entre jugadas faciles.
 */
export function precisionGlobal(precisiones: number[], winPercentsPartida: number[]): number {
  if (precisiones.length === 0) return 0;

  const ventana = clamp(Math.ceil(precisiones.length / 10), 2, 8);
  const pesos = precisiones.map((_, i) => {
    const desde = clamp(i - ventana, 0, Math.max(0, winPercentsPartida.length - ventana));
    const trozo = winPercentsPartida.slice(desde, desde + ventana);
    return clamp(desviacionTipica(trozo), 0.5, 12);
  });

  const sumaPesos = pesos.reduce((a, b) => a + b, 0);
  const ponderada = sumaPesos > 0
    ? precisiones.reduce((acc, p, i) => acc + p * pesos[i]!, 0) / sumaPesos
    : media(precisiones);

  const armonica = mediaArmonica(precisiones);

  return clamp((ponderada + armonica) / 2, 0, 100);
}

function desviacionTipica(valores: number[]): number {
  if (valores.length === 0) return 0;
  const m = media(valores);
  return Math.sqrt(media(valores.map((v) => (v - m) ** 2)));
}

function mediaArmonica(valores: number[]): number {
  // Un 0 real haria divergir la media armonica; el epsilon la mantiene finita
  // conservando el castigo severo que buscamos.
  const suma = valores.reduce((acc, v) => acc + 1 / Math.max(v, 0.5), 0);
  return valores.length / suma;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function redondear(n: number, decimales = 1): number {
  const f = 10 ** decimales;
  return Math.round(n * f) / f;
}

export function media(valores: number[]): number {
  if (valores.length === 0) return 0;
  return valores.reduce((a, b) => a + b, 0) / valores.length;
}
