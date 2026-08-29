import { Chess, type Square } from 'chess.js';
import type {
  Calidad,
  Color,
  Consejo,
  EtiquetaHabito,
  Evaluacion,
  InformePartida,
  JugadaAnalizada,
} from '@shared';

export const COLOR_JUGADA = '#e0653f';
export const COLOR_MEJOR = '#3fa66b';
const AVISO = 'rgba(224, 175, 104, 0.55)';
const PELIGRO = 'rgba(247, 118, 142, 0.55)';

export type TipoPaso = 'resumen' | 'apertura' | 'jugada' | 'consejo' | 'cierre';
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

export interface Paso {
  id: string;
  tipo: TipoPaso;
  /** Rótulo corto de sección, para orientar dentro del recorrido. */
  seccion: string;
  titulo: string;
  texto: string;

  fen: string;
  orientacion: Color;
  flechas: Flecha[];
  resaltadas: Record<string, { backgroundColor: string }>;
  leyendas: Leyenda[];

  insignia?: { texto: string; tono: Tono };
  evolucion?: { antes: Evaluacion; despues: Evaluacion };
  linea?: string[];
  /** Reparto de tus jugadas por calidad, para pintarlo como barra apilada. */
  desglose?: { calidad: Calidad; veces: number }[];
}

/** Orden de mejor a peor: es el que se usa en la barra y en la leyenda. */
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

/** Nombre de una calidad concordado con el numero de jugadas que la tienen. */
export function nombreCalidad(calidad: Calidad, veces: number): string {
  const [singular, plural] = NOMBRE_CALIDAD[calidad];
  return veces === 1 ? singular : plural;
}

const FEN_INICIAL = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/**
 * Construye el recorrido guiado de una partida: una pantalla por idea.
 *
 * El orden es el de una clase: primero cómo acabó la cosa, luego la apertura,
 * después los momentos que decidieron la partida y por último los hábitos a
 * corregir. Cada paso lleva siempre una posición concreta, porque un consejo
 * sobre la apertura sin ver las piezas no enseña nada.
 */
export function construirGuion(informe: InformePartida): Paso[] {
  const color = informe.colorJugador;
  const mias = informe.jugadas.filter((j) => j.color === color);
  const pasos: Paso[] = [];

  pasos.push(pasoResumen(informe));

  const apertura = pasoApertura(informe);
  if (apertura) pasos.push(apertura);

  const clave = momentosClave(mias);
  clave.forEach((j, i) => pasos.push(pasoJugada(informe, j, i + 1, clave.length)));

  for (const c of consejosIlustrables(informe)) pasos.push(c);

  pasos.push(pasoCierre(informe, clave));

  return pasos;
}

/* ------------------------------------------------------------------ */
/* Pasos                                                               */
/* ------------------------------------------------------------------ */

function pasoResumen(informe: InformePartida): Paso {
  const color = informe.colorJugador;
  const resumen = informe.resumen[color];
  const ultima = informe.jugadas.at(-1);
  const yo = color === 'w' ? informe.blancas : informe.negras;
  const rival = color === 'w' ? informe.negras : informe.blancas;

  const fallos = resumen.conteo.grave + resumen.conteo.error;
  const texto =
    fallos === 0
      ? 'Jugaste sin errores serios. Vamos a repasar dónde había algo mejor.'
      : fallos === 1
        ? 'Cometiste 1 fallo importante. Vamos a verlo con calma.'
        : `Cometiste ${fallos} fallos importantes. Vamos a verlos uno a uno.`;

  return {
    id: 'resumen',
    tipo: 'resumen',
    seccion: 'Tu partida',
    titulo: `${yo} contra ${rival}`,
    texto,
    fen: ultima?.fenDespues ?? FEN_INICIAL,
    orientacion: color,
    flechas: [],
    resaltadas: {},
    leyendas: [],
    insignia: {
      texto: `${resumen.precision}% de precisión`,
      tono: resumen.precision >= 90 ? 'bien' : resumen.precision >= 75 ? 'aviso' : 'mal',
    },
    desglose: ORDEN_CALIDAD.map((calidad) => ({ calidad, veces: resumen.conteo[calidad] })).filter(
      (d) => d.veces > 0,
    ),
  };
}

/** La apertura, enseñando la posición real a la que llevó la teoría. */
function pasoApertura(informe: InformePartida): Paso | null {
  const color = informe.colorJugador;
  const ap = informe.apertura;

  if (!ap) {
    const hasta = informe.jugadas[Math.min(5, informe.jugadas.length - 1)];
    if (!hasta) return null;
    return {
      id: 'apertura',
      tipo: 'apertura',
      seccion: 'Apertura',
      titulo: 'Apertura sin nombre conocido',
      texto:
        'Tus primeras jugadas no coinciden con ninguna apertura del libro. No es un error, pero jugar algo estudiado te ahorra pensar en posiciones que ya están resueltas.',
      fen: hasta.fenDespues,
      orientacion: color,
      flechas: [],
      resaltadas: casillasCentrales(),
      leyendas: [{ color: AVISO, texto: 'el centro, lo que se disputa en la apertura' }],
    };
  }

  const ultimaTeorica = informe.jugadas[ap.plyLibro - 1];
  const primeraPropia = informe.jugadas[ap.plyLibro];

  const flechas: Flecha[] = [];
  if (ultimaTeorica) {
    flechas.push({
      desde: ultimaTeorica.uci.slice(0, 2),
      hasta: ultimaTeorica.uci.slice(2, 4),
      color: COLOR_MEJOR,
    });
  }
  if (primeraPropia) {
    flechas.push({
      desde: primeraPropia.uci.slice(0, 2),
      hasta: primeraPropia.uci.slice(2, 4),
      color: COLOR_JUGADA,
    });
  }

  const jugadaTeorica = Math.ceil(ap.plyLibro / 2);

  // La primera jugada fuera de libro puede ser del rival: atribuirsela al
  // usuario seria falso, y ademas confunde sobre de quien es el turno en la
  // posicion que esta viendo.
  const laSacoElUsuario = primeraPropia?.color === color;

  let texto: string;
  if (!primeraPropia) {
    texto = 'Toda la partida se mantuvo dentro de la teoría de esta apertura.';
  } else if (laSacoElUsuario) {
    texto = `Hasta aquí seguiste teoría conocida (jugada ${jugadaTeorica}). La siguiente, ${primeraPropia.san}, ya es decisión tuya: a partir de ese punto no te ayuda la memoria, sino entender el plan.`;
  } else {
    texto = `Hasta aquí la partida seguía teoría conocida (jugada ${jugadaTeorica}). Quien se salió del libro fue tu rival, con ${primeraPropia.san}: desde ahí jugáis los dos por vuestra cuenta.`;
  }

  const leyendas: Leyenda[] = [{ color: COLOR_MEJOR, texto: 'última jugada de teoría' }];
  if (primeraPropia) {
    leyendas.push({
      color: COLOR_JUGADA,
      texto: laSacoElUsuario ? 'tu primera jugada propia' : 'tu rival sale del libro',
    });
  }

  return {
    id: 'apertura',
    tipo: 'apertura',
    seccion: 'Apertura',
    titulo: ap.nombre,
    texto,
    fen: ultimaTeorica?.fenDespues ?? FEN_INICIAL,
    orientacion: color,
    flechas,
    resaltadas: {},
    leyendas,
    insignia: { texto: ap.eco, tono: 'neutro' },
  };
}

/** Un momento clave: la posición antes de mover, con las dos opciones dibujadas. */
function pasoJugada(informe: InformePartida, j: JugadaAnalizada, n: number, total: number): Paso {
  const flechas: Flecha[] = [
    { desde: j.uci.slice(0, 2), hasta: j.uci.slice(2, 4), color: COLOR_JUGADA },
  ];
  const leyendas: Leyenda[] = [{ color: COLOR_JUGADA, texto: `lo que jugaste: ${j.san}` }];

  if (j.mejorJugadaUci && j.mejorJugadaSan) {
    flechas.push({
      desde: j.mejorJugadaUci.slice(0, 2),
      hasta: j.mejorJugadaUci.slice(2, 4),
      color: COLOR_MEJOR,
    });
    leyendas.push({ color: COLOR_MEJOR, texto: `lo mejor: ${j.mejorJugadaSan}` });
  }

  return {
    id: `jugada-${j.ply}`,
    tipo: 'jugada',
    seccion: `Momento clave ${n} de ${total}`,
    titulo: `${j.numeroJugada}${j.color === 'w' ? '.' : '...'} ${j.san}`,
    // La continuacion se pinta en su propio bloque, asi que la quitamos del
    // parrafo para no decir dos veces lo mismo en una pantalla pequena.
    texto: (j.comentario ?? 'Había una jugada mejor en esta posición.').replace(/\s*\(linea:[^)]*\)/, ''),
    fen: j.fenAntes,
    orientacion: j.color,
    flechas,
    resaltadas: {},
    leyendas,
    insignia: {
      texto: j.calidad === 'grave' ? 'Error grave' : j.calidad === 'error' ? 'Error' : 'Imprecisión',
      tono: j.calidad === 'grave' ? 'mal' : 'aviso',
    },
    evolucion: { antes: j.evalAntes, despues: j.evalDespues },
    linea: j.mejorLineaSan,
  };
}

function pasoCierre(informe: InformePartida, clave: JugadaAnalizada[]): Paso {
  const resumen = informe.resumen[informe.colorJugador];
  const ultima = informe.jugadas.at(-1);

  const puntos = [
    clave.length > 0
      ? `Repasa las ${clave.length} ${clave.length === 1 ? 'posición marcada' : 'posiciones marcadas'} sin mirar la respuesta.`
      : 'No tuviste fallos graves: sube la profundidad de análisis para afinar más.',
    resumen.habitos.length > 0
      ? 'Corrige primero el hábito que más se repite: es lo que más puntos te da.'
      : 'Mantén el ritmo: desarrollo, enroque y centro.',
    'Analiza otra partida para que el apartado Progreso empiece a detectar patrones.',
  ];

  return {
    id: 'cierre',
    tipo: 'cierre',
    seccion: 'Para la próxima',
    titulo: 'Qué llevarte de esta partida',
    texto: puntos.join('\n'),
    fen: ultima?.fenDespues ?? FEN_INICIAL,
    orientacion: informe.colorJugador,
    flechas: [],
    resaltadas: {},
    leyendas: [],
  };
}

/* ------------------------------------------------------------------ */
/* Selección de contenido                                              */
/* ------------------------------------------------------------------ */

/**
 * Los momentos que merecen una pantalla propia.
 *
 * Primero los errores de verdad. Si la partida fue limpia, caemos en las
 * imprecisiones más caras para que el recorrido nunca quede vacío.
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

/** Consejos de la partida, cada uno con una posición que lo ilustra. */
function consejosIlustrables(informe: InformePartida): Paso[] {
  const color = informe.colorJugador;
  const resumen = informe.resumen[color];
  const mias = informe.jugadas.filter((j) => j.color === color);
  const pasos: Paso[] = [];

  for (const habito of resumen.habitos) {
    const paso = pasoHabito(habito, informe, mias);
    if (paso) pasos.push(paso);
  }

  // Los consejos que no son hábitos (fase floja, apertura) se muestran sobre la
  // posición más representativa que tengamos a mano.
  const sobrantes = informe.consejos.filter(
    (c) => !c.titulo.includes('Dejas el rey') && !c.titulo.includes('Sacas la dama'),
  );
  const fase = sobrantes.find((c) => c.titulo.startsWith('Tu fase'));
  if (fase) {
    const paso = pasoFase(fase, informe, mias);
    if (paso) pasos.push(paso);
  }

  return pasos;
}

function pasoHabito(
  habito: EtiquetaHabito,
  informe: InformePartida,
  mias: JugadaAnalizada[],
): Paso | null {
  const color = informe.colorJugador;
  const base = {
    tipo: 'consejo' as const,
    seccion: 'Hábito a corregir',
    orientacion: color,
    resaltadas: {},
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
        ...base,
        id: 'habito-sin-enrocar',
        titulo: 'Tu rey se quedó en el centro',
        texto:
          'En la jugada ' +
          ultima.numeroJugada +
          ' tu rey seguía en su casilla inicial. Un rey sin enrocar es el origen de casi todos los ataques que se reciben: enroca dentro de las 10 primeras jugadas salvo que tengas un motivo concreto.',
        fen: ultima.fenDespues,
        resaltadas: { [casillaRey]: { backgroundColor: PELIGRO } },
        leyendas: [{ color: PELIGRO, texto: 'tu rey, todavía en el centro' }],
      };
    }

    case 'dama_temprana': {
      const salida = mias.slice(0, 4).find((j) => piezaEn(j.fenAntes, j.uci.slice(0, 2)) === 'q');
      if (!salida) return null;
      return {
        ...base,
        id: 'habito-dama',
        titulo: 'Sacaste la dama demasiado pronto',
        texto: `${salida.numeroJugada}${salida.color === 'w' ? '.' : '...'} ${salida.san} saca la pieza más valiosa antes que las demás. El rival gana tiempo atacándola mientras desarrolla. Primero caballos y alfiles, después la dama.`,
        fen: salida.fenDespues,
        flechas: [
          { desde: salida.uci.slice(0, 2), hasta: salida.uci.slice(2, 4), color: COLOR_JUGADA },
        ],
        resaltadas: { [salida.uci.slice(2, 4)]: { backgroundColor: PELIGRO } },
        leyendas: [{ color: COLOR_JUGADA, texto: 'la salida temprana de tu dama' }],
      };
    }

    case 'misma_pieza_repetida': {
      const repetida = piezaRepetida(mias.slice(0, 10));
      if (!repetida) return null;
      return {
        ...base,
        id: 'habito-repetida',
        titulo: 'Moviste la misma pieza una y otra vez',
        texto: `Esta pieza se movió ${repetida.veces} veces en la apertura mientras el resto de tu ejército seguía en casa. Cada jugada repetida es un tiempo regalado: saca una pieza nueva mientras te queden.`,
        fen: repetida.jugada.fenDespues,
        flechas: [
          {
            desde: repetida.jugada.uci.slice(0, 2),
            hasta: repetida.jugada.uci.slice(2, 4),
            color: COLOR_JUGADA,
          },
        ],
        resaltadas: sinDesarrollar(repetida.jugada.fenDespues, color),
        leyendas: [
          { color: COLOR_JUGADA, texto: 'la pieza que repetiste' },
          { color: AVISO, texto: 'piezas tuyas todavía sin salir' },
        ],
      };
    }

    case 'desarrollo_lento': {
      const decima = mias[Math.min(9, mias.length - 1)];
      if (!decima) return null;
      const dormidas = sinDesarrollar(decima.fenDespues, color);
      return {
        ...base,
        id: 'habito-desarrollo',
        titulo: 'Tardas en sacar las piezas',
        texto: `En la jugada ${decima.numeroJugada} todavía te quedaban piezas en su casilla de origen. La apertura consiste en poner en juego caballos y alfiles y enrocar: a las 10 jugadas deberías tenerlo casi todo fuera.`,
        fen: decima.fenDespues,
        resaltadas: dormidas,
        leyendas: [{ color: AVISO, texto: 'piezas que siguen sin desarrollar' }],
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
        ...base,
        id: 'habito-peones',
        titulo: 'Debilitaste los peones de tu rey',
        texto: `Mover los peones f, g y h delante del rey abre vías de ataque que ya no se cierran. ${avance.numeroJugada}${avance.color === 'w' ? '.' : '...'} ${avance.san} es uno de esos avances: hazlos solo cuando ganes algo concreto a cambio.`,
        fen: avance.fenDespues,
        flechas: [
          { desde: avance.uci.slice(0, 2), hasta: avance.uci.slice(2, 4), color: COLOR_JUGADA },
        ],
        leyendas: [{ color: COLOR_JUGADA, texto: 'el avance que debilita' }],
      };
    }

    default:
      return null;
  }
}

function pasoFase(consejo: Consejo, informe: InformePartida, mias: JugadaAnalizada[]): Paso | null {
  const faseTexto = consejo.titulo.toLowerCase();
  const fase = faseTexto.includes('apertura')
    ? 'apertura'
    : faseTexto.includes('final')
      ? 'final'
      : 'medio';

  // Enseñamos la jugada más cara de esa fase: es lo que la hace floja.
  const peor = mias
    .filter((j) => j.fase === fase)
    .sort((a, b) => b.perdidaCp - a.perdidaCp)[0];
  if (!peor) return null;

  return {
    id: `fase-${fase}`,
    tipo: 'consejo',
    seccion: 'Dónde pierdes más',
    titulo: consejo.titulo,
    texto: `${consejo.detalle} Esta es la posición que más te costó en esa fase.`,
    fen: peor.fenAntes,
    orientacion: informe.colorJugador,
    flechas: [
      { desde: peor.uci.slice(0, 2), hasta: peor.uci.slice(2, 4), color: COLOR_JUGADA },
      ...(peor.mejorJugadaUci
        ? [
            {
              desde: peor.mejorJugadaUci.slice(0, 2),
              hasta: peor.mejorJugadaUci.slice(2, 4),
              color: COLOR_MEJOR,
            },
          ]
        : []),
    ],
    resaltadas: {},
    leyendas: [
      { color: COLOR_JUGADA, texto: `jugaste ${peor.san}` },
      ...(peor.mejorJugadaSan ? [{ color: COLOR_MEJOR, texto: `mejor ${peor.mejorJugadaSan}` }] : []),
    ],
    insignia: { texto: 'Tu punto flojo', tono: 'aviso' },
  };
}

/* ------------------------------------------------------------------ */
/* Utilidades de tablero                                               */
/* ------------------------------------------------------------------ */

function piezaEn(fen: string, casilla: string): string | null {
  try {
    return new Chess(fen).get(casilla as Square)?.type ?? null;
  } catch {
    return null;
  }
}

/** Caballos y alfiles que siguen en su casilla de origen. */
function sinDesarrollar(fen: string, color: Color): Record<string, { backgroundColor: string }> {
  const origen = color === 'w' ? ['b1', 'g1', 'c1', 'f1'] : ['b8', 'g8', 'c8', 'f8'];
  const salida: Record<string, { backgroundColor: string }> = {};
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

function casillasCentrales(): Record<string, { backgroundColor: string }> {
  return Object.fromEntries(['d4', 'e4', 'd5', 'e5'].map((c) => [c, { backgroundColor: AVISO }]));
}

/**
 * Encuentra la pieza que más veces se movió en la apertura, siguiendo su rastro
 * de casilla en casilla.
 */
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

    const previo = conteo.get(id);
    conteo.set(id, { veces: (previo?.veces ?? 0) + 1, ultima: j });
  }

  const peor = [...conteo.values()].sort((a, b) => b.veces - a.veces)[0];
  return peor && peor.veces >= 3 ? { jugada: peor.ultima, veces: peor.veces } : null;
}
