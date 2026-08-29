import type { Calidad, Consejo, EtiquetaHabito, JugadaAnalizada, ResumenColor } from '../types.js';
import { DESCRIPCIONES } from './tags.js';
import { redondear } from './scoring.js';

const NOMBRE_CALIDAD: Record<Calidad, string> = {
  mejor: 'la mejor jugada',
  excelente: 'excelente',
  buena: 'buena',
  imprecision: 'imprecisa',
  error: 'un error',
  grave: 'un error grave',
};

function nombreJugada(ply: number): string {
  return `${Math.ceil(ply / 2)}${ply % 2 === 1 ? '.' : '...'}`;
}

/**
 * Redacta la explicacion de una jugada a partir de los datos del motor.
 *
 * No inventa nada: cada frase se apoya en la evaluacion, en la mejor jugada o
 * en la refutacion concreta que ha encontrado Stockfish.
 */
export function explicarJugada(
  j: Omit<JugadaAnalizada, 'comentario'>,
  refutacionSan: string | null,
): string | null {
  if (j.calidad === 'mejor' || j.calidad === 'excelente') return null;

  const partes: string[] = [];
  const etiqueta = `${nombreJugada(j.ply)} ${j.san} es ${NOMBRE_CALIDAD[j.calidad]}`;

  if (j.etiquetas.includes('mate_perdido')) {
    partes.push(`${etiqueta}: tenias mate forzado y se te escapo.`);
  } else if (j.etiquetas.includes('mate_permitido')) {
    partes.push(`${etiqueta}: le das al rival un mate forzado.`);
  } else if (j.etiquetas.includes('pieza_colgada') && refutacionSan) {
    partes.push(`${etiqueta}: el rival responde ${refutacionSan} y se lleva material gratis.`);
  } else if (j.etiquetas.includes('material_perdido') && j.mejorJugadaSan) {
    partes.push(`${etiqueta}: tenias ${j.mejorJugadaSan} sobre el tablero, que gana material.`);
  } else if (j.calidad === 'buena') {
    partes.push(`${etiqueta}, pero habia algo mejor.`);
  } else {
    partes.push(`${etiqueta}: pierdes ${redondear(j.perdidaWin)} puntos de probabilidad de victoria.`);
  }

  if (j.mejorJugadaSan && !j.etiquetas.includes('material_perdido')) {
    const linea = j.mejorLineaSan.length > 1 ? ` (linea: ${j.mejorLineaSan.join(' ')})` : '';
    partes.push(`Mejor era ${j.mejorJugadaSan}${linea}.`);
  }

  return partes.join(' ');
}

/**
 * Genera los consejos priorizados de la partida: que corregir primero.
 *
 * El orden lo marca el impacto real (cuantos puntos de evaluacion te cuesta
 * cada patron), no un ranking fijo de gravedad teorica.
 */
export function generarConsejos(
  resumen: ResumenColor,
  jugadas: JugadaAnalizada[],
  aperturaConsejo: string | null,
): Consejo[] {
  const consejos: Consejo[] = [];

  const graves = jugadas.filter((j) => j.calidad === 'grave');
  if (graves.length > 0) {
    const listado = graves
      .slice(0, 4)
      .map((j) => `${nombreJugada(j.ply)} ${j.san}`)
      .join(', ');
    consejos.push({
      titulo: `${graves.length} error${graves.length === 1 ? '' : 'es'} grave${graves.length === 1 ? '' : 's'} decidieron la partida`,
      detalle: `Revisa ${listado}. Antes de mover, comprueba siempre tres cosas: que jaques tiene el rival, que capturas tiene y que piezas tuyas quedan sin defender.`,
      prioridad: 1,
    });
  }

  const colgadas = jugadas.filter((j) => j.etiquetas.includes('pieza_colgada'));
  if (colgadas.length > 0) {
    consejos.push({
      titulo: 'Estas regalando material',
      detalle: `En ${colgadas.length} jugada${colgadas.length === 1 ? '' : 's'} dejaste una pieza capturable gratis. Es el fallo que mas puntos cuesta y el mas facil de arreglar: acostumbrate a repasar tus piezas sin defensa despues de cada jugada del rival.`,
      prioridad: 1,
    });
  }

  const perdidos = jugadas.filter((j) => j.etiquetas.includes('material_perdido'));
  if (perdidos.length > 0) {
    consejos.push({
      titulo: 'Se te escapan capturas ganadoras',
      detalle: `Hubo ${perdidos.length} momento${perdidos.length === 1 ? '' : 's'} con material gratis sobre el tablero. Entrena tacticas basicas (clavadas, horquillas, ataques dobles) 10 minutos al dia: es lo que mas rapido sube el nivel.`,
      prioridad: 2,
    });
  }

  const fases = Object.entries(resumen.perdidaPorFase)
    .filter(([, v]) => v.jugadas >= 4)
    .sort((a, b) => b[1].perdidaMedia - a[1].perdidaMedia);
  const peorFase = fases[0];
  if (peorFase && peorFase[1].perdidaMedia > 40) {
    const nombres = { apertura: 'la apertura', medio: 'el medio juego', final: 'el final' } as const;
    consejos.push({
      titulo: `Tu fase mas debil es ${nombres[peorFase[0] as keyof typeof nombres]}`,
      detalle: `Ahi pierdes de media ${Math.round(peorFase[1].perdidaMedia)} centipeones por jugada, bastante mas que en el resto de la partida.`,
      prioridad: 2,
    });
  }

  const CONSEJO_HABITO: Record<EtiquetaHabito, string> = {
    sin_enrocar: 'Enroca dentro de las primeras 10 jugadas salvo que tengas una razon concreta para no hacerlo. Un rey en el centro es el origen de la mayoria de los ataques que se reciben.',
    dama_temprana: 'Saca la dama despues de los caballos y alfiles. Si sale pronto, el rival gana tiempos atacandola mientras desarrolla.',
    desarrollo_lento: 'En las 10 primeras jugadas deberias tener los dos caballos y al menos un alfil fuera, y estar enrocado.',
    misma_pieza_repetida: 'Mover dos y tres veces la misma pieza en la apertura regala tiempos. Saca una pieza nueva en cada jugada mientras puedas.',
    peones_rey_debilitados: 'Evita mover los peones f, g y h delante de tu rey sin necesidad: cada avance abre una via de ataque permanente.',
  };

  for (const h of resumen.habitos) {
    consejos.push({ titulo: DESCRIPCIONES[h], detalle: CONSEJO_HABITO[h], prioridad: 3 });
  }

  if (aperturaConsejo) {
    consejos.push({ titulo: 'Sobre tu apertura', detalle: aperturaConsejo, prioridad: 3 });
  }

  if (consejos.length === 0) {
    consejos.push({
      titulo: 'Partida solida',
      detalle: `Precision del ${redondear(resumen.precision)}% sin errores destacables. Para seguir mejorando, revisa las jugadas marcadas como "buena": son las posiciones donde habia algo claramente mejor.`,
      prioridad: 3,
    });
  }

  return consejos.sort((a, b) => a.prioridad - b.prioridad);
}
