import { Chess, type Square } from 'chess.js';
import type {
  Calidad,
  Color,
  EtiquetaHabito,
  Evaluacion,
  InformePartida,
  JugadaAnalizada,
} from '@shared';

export const COLOR_JUGADA = '#e0653f';
export const COLOR_MEJOR = '#3fa66b';
const AVISO = 'rgba(224, 175, 104, 0.55)';
const PELIGRO = 'rgba(247, 118, 142, 0.55)';
const ULTIMA = 'rgba(125, 207, 255, 0.30)';

export type Tono = 'bien' | 'mal' | 'aviso' | 'neutro';

export interface Flecha {
  desde: string;
  hasta: string;
  color: string;
}

export interface Leyenda {
  color: string;
  texto: string;
}

export type Resaltadas = Record<string, { backgroundColor: string }>;

/**
 * Lo que el entrenador tiene que decir en una parada concreta del recorrido.
 *
 * Va siempre asociada a una posición del tablero, no a un texto suelto: si no
 * se ven las piezas, el consejo no se entiende.
 */
export interface Anotacion {
  clase: 'clave' | 'habito' | 'apertura' | 'fase';
  seccion: string;
  titulo: string;
  texto: string;
  flechas: Flecha[];
  resaltadas: Resaltadas;
  leyendas: Leyenda[];
  insignia?: { texto: string; tono: Tono };
  evolucion?: { antes: Evaluacion; despues: Evaluacion };
  linea?: string[];
}

export interface Recorrido {
  orientacion: Color;
  /** fens[k] es el tablero tras k medias jugadas; fens[0] es la posición inicial. */
  fens: string[];
  jugadas: JugadaAnalizada[];
  /** Anotación que toca mostrar al llegar a esa parada. */
  anotaciones: Map<number, Anotacion>;
  /** Paradas con anotación, en orden: las usa el botón de salto. */
  hitos: number[];
  resumen: {
    titulo: string;
    texto: string;
    insignia: { texto: string; tono: Tono };
    desglose: { calidad: Calidad; veces: number }[];
  };
  cierre: { titulo: string; puntos: string[] };
}

export const ORDEN_CALIDAD: Calidad[] = [
  'mejor',
  'excelente',
  'buena',
  'imprecision',
  'error',
  'grave',
];

export const COLOR_CALIDAD: Record<Calidad, string> = {
  mejor: '#7dcfff',
  excelente: '#9ece6a',
  buena: '#6b7280',
  imprecision: '#e0af68',
  error: '#ff9e64',
  grave: '#f7768e',
};

const NOMBRE_CALIDAD: Record<Calidad, [singular: string, plural: string]> = {
  mejor: ['la mejor', 'las mejores'],
  excelente: ['excelente', 'excelentes'],
  buena: ['buena', 'buenas'],
  imprecision: ['imprecisión', 'imprecisiones'],
  error: ['error', 'errores'],
  grave: ['error grave', 'errores graves'],
};

export function nombreCalidad(calidad: Calidad, veces: number): string {
  const [singular, plural] = NOMBRE_CALIDAD[calidad];
  return veces === 1 ? singular : plural;
}

export const ETIQUETA_CALIDAD: Record<Calidad, string> = {
  mejor: 'Mejor jugada',
  excelente: 'Excelente',
  buena: 'Buena',
  imprecision: 'Imprecisión',
  error: 'Error',
  grave: 'Error grave',
};

/**
 * Prepara el recorrido de una partida como una única línea temporal.
 *
 * El repaso avanza jugada a jugada, sin saltos: así se ve cómo se llega a cada
 * posición en lugar de aparecer de golpe ocho jugadas más adelante. Los
 * consejos no viven aparte, sino colgados de la parada exacta en la que la
 * partida los demuestra.
 */
export function construirRecorrido(informe: InformePartida): Recorrido {
  const color = informe.colorJugador;
  const jugadas = informe.jugadas;
  const mias = jugadas.filter((j) => j.color === color);

  const fens = [jugadas[0]?.fenAntes ?? new Chess().fen(), ...jugadas.map((j) => j.fenDespues)];
  const anotaciones = new Map<number, Anotacion>();

  // Los momentos clave se anotan en la posición ANTERIOR a la jugada: es donde
  // había que decidir, y donde tiene sentido dibujar las dos alternativas.
  for (const j of momentosClave(mias)) {
    const parada = j.ply - 1;
    if (parada >= 1) colocar(anotaciones, parada, anotacionClave(j));
  }

  const apertura = anotacionApertura(informe);
  if (apertura) colocar(anotaciones, apertura.parada, apertura.anotacion);

  for (const habito of informe.resumen[color].habitos) {
    const ubicada = anotacionHabito(habito, informe, mias);
    if (ubicada) colocar(anotaciones, ubicada.parada, ubicada.anotacion);
  }

  return {
    orientacion: color,
    fens,
    jugadas,
    anotaciones,
    hitos: [...anotaciones.keys()].sort((a, b) => a - b),
    resumen: construirResumen(informe),
    cierre: construirCierre(informe, momentosClave(mias).length),
  };
}

/** Prioridad cuando dos anotaciones caen en la misma parada. */
const PRIORIDAD: Record<Anotacion['clase'], number> = { clave: 0, apertura: 1, habito: 2, fase: 3 };

/**
 * Coloca una anotación en su parada.
 *
 * Cada anotación está anclada a una posición concreta: sus flechas y sus
 * casillas marcadas solo significan algo en ese tablero. Por eso, si dos caen
 * en la misma parada, no se desplaza ninguna (quedaría dibujada sobre una
 * posición que ya no le corresponde): se queda la más importante.
 */
function colocar(mapa: Map<number, Anotacion>, parada: number, anotacion: Anotacion): void {
  const previa = mapa.get(parada);
  if (previa && PRIORIDAD[previa.clase] <= PRIORIDAD[anotacion.clase]) return;
  mapa.set(parada, anotacion);
}

/** Casillas de la última jugada, para no perder de vista qué se acaba de mover. */
export function resaltarUltima(jugada: JugadaAnalizada | undefined): Resaltadas {
  if (!jugada) return {};
  return {
    [jugada.uci.slice(0, 2)]: { backgroundColor: ULTIMA },
    [jugada.uci.slice(2, 4)]: { backgroundColor: ULTIMA },
  };
}

/* ------------------------------------------------------------------ */
/* Anotaciones                                                         */
/* ------------------------------------------------------------------ */

function anotacionClave(j: JugadaAnalizada): Anotacion {
  const flechas: Flecha[] = [
    { desde: j.uci.slice(0, 2), hasta: j.uci.slice(2, 4), color: COLOR_JUGADA },
  ];
  const leyendas: Leyenda[] = [{ color: COLOR_JUGADA, texto: `vas a jugar ${j.san}` }];

  if (j.mejorJugadaUci && j.mejorJugadaSan) {
    flechas.push({
      desde: j.mejorJugadaUci.slice(0, 2),
      hasta: j.mejorJugadaUci.slice(2, 4),
      color: COLOR_MEJOR,
    });
    leyendas.push({ color: COLOR_MEJOR, texto: `lo mejor era ${j.mejorJugadaSan}` });
  }

  return {
    clase: 'clave',
    seccion: 'Atención a esta jugada',
    titulo: `${j.numeroJugada}${j.color === 'w' ? '.' : '...'} ${j.san}`,
    // La continuación se pinta en su propio bloque: fuera del párrafo para no
    // repetir lo mismo dos veces en una pantalla pequeña.
    texto: (j.comentario ?? 'Había una jugada mejor en esta posición.').replace(
      /\s*\(linea:[^)]*\)/,
      '',
    ),
    flechas,
    resaltadas: {},
    leyendas,
    insignia: {
      texto: ETIQUETA_CALIDAD[j.calidad],
      tono: j.calidad === 'grave' ? 'mal' : 'aviso',
    },
    evolucion: { antes: j.evalAntes, despues: j.evalDespues },
    linea: j.mejorLineaSan,
  };
}

function anotacionApertura(
  informe: InformePartida,
): { parada: number; anotacion: Anotacion } | null {
  const ap = informe.apertura;
  if (!ap) return null;

  const ultimaTeorica = informe.jugadas[ap.plyLibro - 1];
  const primeraPropia = informe.jugadas[ap.plyLibro];
  if (!ultimaTeorica) return null;

  // La primera jugada fuera de libro puede ser del rival: atribuírsela al
  // usuario sería falso y confunde sobre de quién es el turno.
  const laSacoElUsuario = primeraPropia?.color === informe.colorJugador;
  const jugadaTeorica = Math.ceil(ap.plyLibro / 2);

  let texto: string;
  if (!primeraPropia) {
    texto = 'Toda la partida se mantuvo dentro de la teoría de esta apertura.';
  } else if (laSacoElUsuario) {
    texto = `Hasta aquí seguiste teoría conocida (jugada ${jugadaTeorica}). Lo siguiente, ${primeraPropia.san}, ya es decisión tuya: a partir de este punto no te ayuda la memoria, sino entender el plan.`;
  } else {
    texto = `Hasta aquí la partida seguía teoría conocida (jugada ${jugadaTeorica}). Quien se sale del libro es tu rival, con ${primeraPropia.san}: desde aquí jugáis los dos por vuestra cuenta.`;
  }

  const flechas: Flecha[] = primeraPropia
    ? [
        {
          desde: primeraPropia.uci.slice(0, 2),
          hasta: primeraPropia.uci.slice(2, 4),
          color: COLOR_JUGADA,
        },
      ]
    : [];

  return {
    parada: ap.plyLibro,
    anotacion: {
      clase: 'apertura',
      seccion: 'Fin de la teoría',
      titulo: ap.nombre,
      texto,
      flechas,
      resaltadas: {},
      leyendas: primeraPropia
        ? [
            {
              color: COLOR_JUGADA,
              texto: laSacoElUsuario ? 'tu primera jugada propia' : 'tu rival sale del libro',
            },
          ]
        : [],
      insignia: { texto: ap.eco, tono: 'neutro' },
    },
  };
}

function anotacionHabito(
  habito: EtiquetaHabito,
  informe: InformePartida,
  mias: JugadaAnalizada[],
): { parada: number; anotacion: Anotacion } | null {
  const color = informe.colorJugador;
  const base = {
    clase: 'habito' as const,
    seccion: 'Hábito a corregir',
    resaltadas: {} as Resaltadas,
    leyendas: [] as Leyenda[],
    flechas: [] as Flecha[],
    insignia: { texto: 'Se repite', tono: 'aviso' as Tono },
  };

  switch (habito) {
    case 'sin_enrocar': {
      const casillaRey = color === 'w' ? 'e1' : 'e8';
      const ultima = [...mias].reverse().find((j) => piezaEn(j.fenDespues, casillaRey) === 'k');
      if (!ultima) return null;
      return {
        parada: ultima.ply,
        anotacion: {
          ...base,
          titulo: 'Tu rey sigue en el centro',
          texto: `Vamos por la jugada ${ultima.numeroJugada} y tu rey no se ha movido de su casilla. Un rey sin enrocar es el origen de casi todos los ataques que se reciben: enroca dentro de las 10 primeras jugadas salvo que tengas un motivo concreto.`,
          resaltadas: { [casillaRey]: { backgroundColor: PELIGRO } },
          leyendas: [{ color: PELIGRO, texto: 'tu rey, todavía en el centro' }],
        },
      };
    }

    case 'dama_temprana': {
      const salida = mias.slice(0, 4).find((j) => piezaEn(j.fenAntes, j.uci.slice(0, 2)) === 'q');
      if (!salida) return null;
      return {
        parada: salida.ply,
        anotacion: {
          ...base,
          titulo: 'Sacaste la dama demasiado pronto',
          texto: `${salida.numeroJugada}${salida.color === 'w' ? '.' : '...'} ${salida.san} pone en juego la pieza más valiosa antes que las demás. El rival gana tiempo atacándola mientras desarrolla. Primero caballos y alfiles, después la dama.`,
          resaltadas: { [salida.uci.slice(2, 4)]: { backgroundColor: PELIGRO } },
          leyendas: [{ color: PELIGRO, texto: 'tu dama, expuesta desde ya' }],
        },
      };
    }

    case 'misma_pieza_repetida': {
      const repetida = piezaRepetida(mias.slice(0, 10));
      if (!repetida) return null;
      return {
        parada: repetida.jugada.ply,
        anotacion: {
          ...base,
          titulo: 'Vuelves a mover la misma pieza',
          texto: `Esta pieza ya va por su movimiento número ${repetida.veces} y el resto de tu ejército sigue en casa. Cada jugada repetida en la apertura es un tiempo regalado: saca una pieza nueva mientras te queden.`,
          resaltadas: {
            [repetida.jugada.uci.slice(2, 4)]: { backgroundColor: PELIGRO },
            ...sinDesarrollar(repetida.jugada.fenDespues, color),
          },
          leyendas: [
            { color: PELIGRO, texto: 'la pieza que repites' },
            { color: AVISO, texto: 'piezas tuyas todavía sin salir' },
          ],
        },
      };
    }

    case 'desarrollo_lento': {
      const decima = mias[Math.min(9, mias.length - 1)];
      if (!decima) return null;
      const dormidas = sinDesarrollar(decima.fenDespues, color);
      if (Object.keys(dormidas).length === 0) return null;
      return {
        parada: decima.ply,
        anotacion: {
          ...base,
          titulo: 'Te faltan piezas por sacar',
          texto: `Jugada ${decima.numeroJugada} y todavía tienes piezas en su casilla de origen. La apertura consiste en poner en juego caballos y alfiles y enrocar: a estas alturas deberías tenerlo casi todo fuera.`,
          resaltadas: dormidas,
          leyendas: [{ color: AVISO, texto: 'piezas que siguen sin desarrollar' }],
        },
      };
    }

    case 'peones_rey_debilitados': {
      const avance = mias
        .slice(0, 12)
        .filter(
          (j) => piezaEn(j.fenAntes, j.uci.slice(0, 2)) === 'p' && 'fgh'.includes(j.uci[0] ?? ''),
        )
        .at(-1);
      if (!avance) return null;
      return {
        parada: avance.ply,
        anotacion: {
          ...base,
          titulo: 'Estás debilitando los peones de tu rey',
          texto: `Mover los peones f, g y h delante del rey abre vías de ataque que ya no se cierran. ${avance.numeroJugada}${avance.color === 'w' ? '.' : '...'} ${avance.san} es uno de esos avances: hazlos solo cuando ganes algo concreto a cambio.`,
          resaltadas: { [avance.uci.slice(2, 4)]: { backgroundColor: PELIGRO } },
          leyendas: [{ color: PELIGRO, texto: 'el avance que debilita' }],
        },
      };
    }

    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* Portada y cierre                                                    */
/* ------------------------------------------------------------------ */

function construirResumen(informe: InformePartida): Recorrido['resumen'] {
  const color = informe.colorJugador;
  const resumen = informe.resumen[color];
  const yo = color === 'w' ? informe.blancas : informe.negras;
  const rival = color === 'w' ? informe.negras : informe.blancas;
  const fallos = resumen.conteo.grave + resumen.conteo.error;

  return {
    titulo: `${yo} contra ${rival}`,
    texto:
      (fallos === 0
        ? 'Jugaste sin errores serios.'
        : fallos === 1
          ? 'Cometiste 1 fallo importante.'
          : `Cometiste ${fallos} fallos importantes.`) +
      ' Vamos a recorrer la partida jugada a jugada; te aviso cuando lleguemos a un momento que merece la pena mirar.',
    insignia: {
      texto: `${resumen.precision}% de precisión`,
      tono: resumen.precision >= 90 ? 'bien' : resumen.precision >= 75 ? 'aviso' : 'mal',
    },
    desglose: ORDEN_CALIDAD.map((calidad) => ({ calidad, veces: resumen.conteo[calidad] })).filter(
      (d) => d.veces > 0,
    ),
  };
}

function construirCierre(informe: InformePartida, momentos: number): Recorrido['cierre'] {
  const resumen = informe.resumen[informe.colorJugador];
  const puntos: string[] = [];

  puntos.push(
    momentos > 0
      ? `Vuelve a las ${momentos} ${momentos === 1 ? 'posición marcada' : 'posiciones marcadas'} e intenta encontrar la jugada sin mirar la respuesta.`
      : 'No tuviste fallos graves: sube la profundidad de análisis para afinar más.',
  );

  // Los consejos que hablan de la partida entera, y no de una posición, no
  // caben en la línea temporal: su sitio es el cierre.
  const fase = informe.consejos.find((c) => c.titulo.startsWith('Tu fase'));
  if (fase) puntos.push(`${fase.titulo}. ${fase.detalle}`);

  const material = informe.consejos.find((c) => c.titulo.includes('capturas ganadoras'));
  if (material) puntos.push(material.detalle);

  puntos.push(
    resumen.habitos.length > 0
      ? 'Corrige primero el hábito que más se repite: es lo que más puntos te da.'
      : 'Mantén el ritmo: desarrollo, enroque y centro.',
  );
  puntos.push('Analiza otra partida para que el apartado Progreso empiece a detectar patrones.');

  return { titulo: 'Qué llevarte de esta partida', puntos };
}

/* ------------------------------------------------------------------ */
/* Selección y utilidades                                              */
/* ------------------------------------------------------------------ */

/**
 * Las jugadas que merecen que el recorrido se detenga.
 *
 * Primero los errores de verdad; si la partida fue limpia, las imprecisiones
 * más caras, para que el repaso nunca quede sin nada que enseñar.
 */
function momentosClave(mias: JugadaAnalizada[]): JugadaAnalizada[] {
  const graves = mias.filter((j) => j.calidad === 'grave' || j.calidad === 'error');
  if (graves.length > 0) return graves.slice(0, 8);

  return mias
    .filter((j) => j.calidad === 'imprecision')
    .sort((a, b) => b.perdidaWin - a.perdidaWin)
    .slice(0, 3)
    .sort((a, b) => a.ply - b.ply);
}

function piezaEn(fen: string, casilla: string): string | null {
  try {
    return new Chess(fen).get(casilla as Square)?.type ?? null;
  } catch {
    return null;
  }
}

/** Caballos y alfiles que siguen en su casilla de origen. */
function sinDesarrollar(fen: string, color: Color): Resaltadas {
  const origen = color === 'w' ? ['b1', 'g1', 'c1', 'f1'] : ['b8', 'g8', 'c8', 'f8'];
  const salida: Resaltadas = {};
  try {
    const chess = new Chess(fen);
    for (const casilla of origen) {
      const pieza = chess.get(casilla as Square);
      if (pieza && pieza.color === color && (pieza.type === 'n' || pieza.type === 'b')) {
        salida[casilla] = { backgroundColor: AVISO };
      }
    }
  } catch {
    // Una posición ilegible no debe romper el recorrido.
  }
  return salida;
}

/** La pieza que más se movió en la apertura, siguiendo su rastro de casilla en casilla. */
function piezaRepetida(
  jugadas: JugadaAnalizada[],
): { jugada: JugadaAnalizada; veces: number } | null {
  const posiciones = new Map<string, string>();
  const conteo = new Map<string, { veces: number; ultima: JugadaAnalizada }>();
  let siguienteId = 0;

  for (const j of jugadas) {
    const desde = j.uci.slice(0, 2);
    const hasta = j.uci.slice(2, 4);
    const id = posiciones.get(desde) ?? `p${siguienteId++}`;
    posiciones.delete(desde);
    posiciones.set(hasta, id);
    conteo.set(id, { veces: (conteo.get(id)?.veces ?? 0) + 1, ultima: j });
  }

  const peor = [...conteo.values()].sort((a, b) => b.veces - a.veces)[0];
  return peor && peor.veces >= 3 ? { jugada: peor.ultima, veces: peor.veces } : null;
}
