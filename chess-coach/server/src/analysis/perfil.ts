import type {
  AperturaPerfil,
  Color,
  Confianza,
  Consejo,
  Etiqueta,
  Fase,
  Hallazgo,
  InformePartida,
  PerfilColor,
  PerfilJugador,
} from '../types.js';
import { DESCRIPCIONES } from './tags.js';
import { media, redondear } from './scoring.js';

const COLORES: Color[] = ['w', 'b'];
const FASES: Fase[] = ['apertura', 'medio', 'final'];

/**
 * Muestras minimas para afirmar algo.
 *
 * Sin esto el perfil diria "tu punto debil es el final" con dos finales
 * jugados, que es ruido con aspecto de diagnostico. Por debajo del minimo el
 * hallazgo ni siquiera se calcula.
 */
const MINIMO = { partidas: 4, jugadasFase: 12, ocasiones: 5, partidasApertura: 3 };

function confianzaDe(muestra: number, minimo: number): Confianza {
  if (muestra >= minimo * 4) return 'alta';
  if (muestra >= minimo * 2) return 'media';
  return 'baja';
}

const NOMBRE_FASE: Record<Fase, string> = {
  apertura: 'la apertura',
  medio: 'el medio juego',
  final: 'el final',
};

const NOMBRE_COLOR: Record<Color, string> = { w: 'blancas', b: 'negras' };

/** Puntos de una partida desde el punto de vista del jugador: 1, 0.5 o 0. */
function puntos(informe: InformePartida): number | null {
  const r = informe.resultado;
  if (r === '1/2-1/2') return 0.5;
  if (r === '1-0') return informe.colorJugador === 'w' ? 1 : 0;
  if (r === '0-1') return informe.colorJugador === 'b' ? 1 : 0;
  return null;
}

/**
 * Construye el perfil de un jugador a partir de sus partidas analizadas.
 *
 * Se calcula sobre los informes completos y no sobre las tablas agregadas
 * porque hace falta el detalle jugada a jugada (que hizo el rival, que
 * respondiste). A cambio no exige migrar ni rellenar nada de lo ya guardado.
 */
export function construirPerfil(informes: InformePartida[]): PerfilJugador {
  const ordenados = [...informes].sort((a, b) => a.creadoEn.localeCompare(b.creadoEn));

  if (ordenados.length === 0) {
    return perfilVacio();
  }

  const precisiones = ordenados.map((i) => i.resumen[i.colorJugador].precision);
  const precisionMedia = redondear(media(precisiones));

  const porColor = Object.fromEntries(
    COLORES.map((c) => [c, perfilDeColor(c, ordenados.filter((i) => i.colorJugador === c))]),
  ) as Record<Color, PerfilColor>;

  const aciertoMejor = calcularAciertoMejor(ordenados);
  const castigo = calcularCastigo(ordenados);
  const solidez = calcularSolidez(ordenados);
  const tendencia = calcularTendencia(precisiones);

  const contexto = { precisionMedia, aciertoMejor, castigo, solidez, tendencia, porColor };

  return {
    partidas: ordenados.length,
    desde: ordenados[0]?.creadoEn ?? null,
    precisionMedia,
    tendencia,
    precisionPorPartida: ordenados.map((i) => ({
      id: i.id,
      creadoEn: i.creadoEn,
      precision: i.resumen[i.colorJugador].precision,
    })),
    aciertoMejor,
    castigo,
    solidez,
    fuertes: detectarFuertes(ordenados, contexto),
    debiles: detectarDebiles(ordenados, contexto),
    porColor,
    plan: construirPlan(ordenados, contexto),
    informeIa: null,
  };
}

type Contexto = {
  precisionMedia: number;
  aciertoMejor: number;
  castigo: { ocasiones: number; aprovechadas: number } | null;
  solidez: { partidas: number; sinGraves: number };
  tendencia: { antes: number; ahora: number } | null;
  porColor: Record<Color, PerfilColor>;
};

/* ------------------------------------------------------------------ */
/* Metricas transversales                                              */
/* ------------------------------------------------------------------ */

/** Porcentaje de tus jugadas que coinciden con la que elige el motor. */
function calcularAciertoMejor(informes: InformePartida[]): number {
  let mias = 0;
  let mejores = 0;

  for (const informe of informes) {
    for (const j of informe.jugadas) {
      if (j.color !== informe.colorJugador) continue;
      mias++;
      if (j.calidad === 'mejor') mejores++;
    }
  }

  return mias === 0 ? 0 : redondear((mejores / mias) * 100);
}

/**
 * Cuantos fallos del rival aprovechas.
 *
 * Es la medida mas directa de "estar atento": cuando el rival se equivoca, la
 * ventaja solo es real si encuentras la jugada que la cobra.
 */
function calcularCastigo(
  informes: InformePartida[],
): { ocasiones: number; aprovechadas: number } | null {
  let ocasiones = 0;
  let aprovechadas = 0;

  for (const informe of informes) {
    const jugadas = informe.jugadas;
    for (let i = 0; i < jugadas.length - 1; i++) {
      const suya = jugadas[i]!;
      const mia = jugadas[i + 1]!;
      if (suya.color === informe.colorJugador) continue;
      if (suya.calidad !== 'grave' && suya.calidad !== 'error') continue;
      if (mia.color !== informe.colorJugador) continue;

      ocasiones++;
      if (mia.calidad === 'mejor' || mia.calidad === 'excelente') aprovechadas++;
    }
  }

  return ocasiones === 0 ? null : { ocasiones, aprovechadas };
}

function calcularSolidez(informes: InformePartida[]): { partidas: number; sinGraves: number } {
  const sinGraves = informes.filter(
    (i) => i.resumen[i.colorJugador].conteo.grave === 0,
  ).length;
  return { partidas: informes.length, sinGraves };
}

/** Compara la primera mitad de las partidas con la segunda. */
function calcularTendencia(precisiones: number[]): { antes: number; ahora: number } | null {
  if (precisiones.length < MINIMO.partidas * 2) return null;
  const mitad = Math.floor(precisiones.length / 2);
  return {
    antes: redondear(media(precisiones.slice(0, mitad))),
    ahora: redondear(media(precisiones.slice(mitad))),
  };
}

/* ------------------------------------------------------------------ */
/* Perfil por color                                                    */
/* ------------------------------------------------------------------ */

function perfilDeColor(color: Color, informes: InformePartida[]): PerfilColor {
  const vacio: PerfilColor = {
    color,
    partidas: 0,
    precisionMedia: 0,
    rendimiento: 0,
    perdidaPorFase: Object.fromEntries(
      FASES.map((f) => [f, { jugadas: 0, perdidaMedia: 0 }]),
    ) as PerfilColor['perdidaPorFase'],
    erroresFrecuentes: [],
    aperturas: [],
    dispersionRepertorio: 0,
  };
  if (informes.length === 0) return vacio;

  const resumenes = informes.map((i) => i.resumen[color]);
  const conPuntos = informes.map(puntos).filter((p): p is number => p !== null);

  // Cada fase se pondera por jugadas, no por partidas: un final de 40 jugadas
  // dice mas del jugador que uno de 3.
  const perdidaPorFase = Object.fromEntries(
    FASES.map((f) => {
      const jugadas = resumenes.reduce((n, r) => n + r.perdidaPorFase[f].jugadas, 0);
      const total = resumenes.reduce(
        (n, r) => n + r.perdidaPorFase[f].perdidaMedia * r.perdidaPorFase[f].jugadas,
        0,
      );
      return [f, { jugadas, perdidaMedia: jugadas === 0 ? 0 : redondear(total / jugadas, 0) }];
    }),
  ) as PerfilColor['perdidaPorFase'];

  const conteoEtiquetas = new Map<Etiqueta, { veces: number; partidas: number }>();
  for (const r of resumenes) {
    for (const [nombre, veces] of Object.entries(r.etiquetas)) {
      if (!veces) continue;
      const etiqueta = nombre as Etiqueta;
      const previo = conteoEtiquetas.get(etiqueta) ?? { veces: 0, partidas: 0 };
      conteoEtiquetas.set(etiqueta, { veces: previo.veces + veces, partidas: previo.partidas + 1 });
    }
  }

  const precisionMedia = redondear(media(resumenes.map((r) => r.precision)));

  return {
    color,
    partidas: informes.length,
    precisionMedia,
    rendimiento: conPuntos.length === 0 ? 0 : redondear(media(conPuntos), 2),
    perdidaPorFase,
    erroresFrecuentes: [...conteoEtiquetas.entries()]
      .filter(([etiqueta]) => etiqueta in DESCRIPCIONES)
      .map(([etiqueta, d]) => ({ etiqueta, ...d, descripcion: DESCRIPCIONES[etiqueta] }))
      .sort((a, b) => b.partidas - a.partidas || b.veces - a.veces),
    aperturas: agruparAperturas(informes, precisionMedia),
    dispersionRepertorio: redondear(
      new Set(informes.map((i) => i.apertura?.eco ?? '?')).size / informes.length,
      2,
    ),
  };
}

function agruparAperturas(informes: InformePartida[], precisionColor: number): AperturaPerfil[] {
  const grupos = new Map<string, InformePartida[]>();
  for (const informe of informes) {
    const eco = informe.apertura?.eco;
    if (!eco) continue;
    grupos.set(eco, [...(grupos.get(eco) ?? []), informe]);
  }

  return [...grupos.entries()]
    .map(([eco, partidas]) => {
      const conPuntos = partidas.map(puntos).filter((p): p is number => p !== null);
      const precisionMedia = redondear(
        media(partidas.map((i) => i.resumen[i.colorJugador].precision)),
      );
      return {
        eco,
        nombre: partidas[0]?.apertura?.nombre ?? eco,
        partidas: partidas.length,
        precisionMedia,
        victorias: conPuntos.filter((p) => p === 1).length,
        tablas: conPuntos.filter((p) => p === 0.5).length,
        derrotas: conPuntos.filter((p) => p === 0).length,
        rendimiento: conPuntos.length === 0 ? 0 : redondear(media(conPuntos), 2),
        desviacion: redondear(precisionMedia - precisionColor),
      };
    })
    .sort((a, b) => b.partidas - a.partidas || b.precisionMedia - a.precisionMedia);
}

/* ------------------------------------------------------------------ */
/* Hallazgos                                                           */
/* ------------------------------------------------------------------ */

/**
 * Lo que haces bien.
 *
 * Existe porque un perfil que solo enumera fallos no enseña a jugar: saber en
 * que te puedes apoyar cambia las decisiones tanto como saber que corregir.
 */
function detectarFuertes(informes: InformePartida[], ctx: Contexto): Hallazgo[] {
  const fuertes: Hallazgo[] = [];
  if (informes.length < MINIMO.partidas) return fuertes;

  if (ctx.castigo && ctx.castigo.ocasiones >= MINIMO.ocasiones) {
    const ratio = ctx.castigo.aprovechadas / ctx.castigo.ocasiones;
    if (ratio >= 0.6) {
      fuertes.push({
        id: 'castigo',
        titulo: 'Aprovechas los fallos del rival',
        detalle:
          'Cuando el rival se equivoca sueles encontrar la jugada que lo cobra. Es la diferencia entre tener ventaja y ganar la partida.',
        evidencia: `${ctx.castigo.aprovechadas} de ${ctx.castigo.ocasiones} ocasiones aprovechadas`,
        muestra: ctx.castigo.ocasiones,
        confianza: confianzaDe(ctx.castigo.ocasiones, MINIMO.ocasiones),
      });
    }
  }

  if (ctx.solidez.sinGraves / ctx.solidez.partidas >= 0.5) {
    fuertes.push({
      id: 'solidez',
      titulo: 'Juegas sin regalar partidas',
      detalle:
        'En la mitad o mas de tus partidas no cometes ningun error grave. Esa regularidad vale mas puntos que las jugadas brillantes.',
      evidencia: `${ctx.solidez.sinGraves} de ${ctx.solidez.partidas} partidas sin errores graves`,
      muestra: ctx.solidez.partidas,
      confianza: confianzaDe(ctx.solidez.partidas, MINIMO.partidas),
    });
  }

  if (ctx.aciertoMejor >= 35) {
    fuertes.push({
      id: 'precision',
      titulo: 'Encuentras la jugada del motor a menudo',
      detalle: 'Una parte alta de tus jugadas coincide con la primera opcion de Stockfish.',
      evidencia: `${ctx.aciertoMejor}% de tus jugadas son la mejor de la posicion`,
      muestra: informes.length,
      confianza: confianzaDe(informes.length, MINIMO.partidas),
    });
  }

  // La fase donde menos pierdes respecto a tu propia media.
  const mejorFase = compararFases(ctx, 'mejor');
  if (mejorFase) fuertes.push(mejorFase);

  if (ctx.tendencia && ctx.tendencia.ahora - ctx.tendencia.antes >= 3) {
    fuertes.push({
      id: 'progreso',
      titulo: 'Estas mejorando',
      detalle: 'Tu precision en las partidas recientes es mayor que en las primeras que analizaste.',
      evidencia: `del ${ctx.tendencia.antes}% al ${ctx.tendencia.ahora}%`,
      muestra: informes.length,
      confianza: confianzaDe(informes.length, MINIMO.partidas * 2),
    });
  }

  const mejorColor = COLORES.map((c) => ctx.porColor[c])
    .filter((p) => p.partidas >= MINIMO.partidas)
    .sort((a, b) => b.precisionMedia - a.precisionMedia)[0];
  const peorColor = COLORES.map((c) => ctx.porColor[c])
    .filter((p) => p.partidas >= MINIMO.partidas)
    .sort((a, b) => a.precisionMedia - b.precisionMedia)[0];

  if (mejorColor && peorColor && mejorColor !== peorColor && mejorColor.precisionMedia - peorColor.precisionMedia >= 5) {
    fuertes.push({
      id: `color-${mejorColor.color}`,
      titulo: `Te encuentras mas comodo con ${NOMBRE_COLOR[mejorColor.color]}`,
      detalle: 'La diferencia es lo bastante grande como para que merezca la pena mirar que cambia.',
      evidencia: `${mejorColor.precisionMedia}% con ${NOMBRE_COLOR[mejorColor.color]} frente a ${peorColor.precisionMedia}% con ${NOMBRE_COLOR[peorColor.color]}`,
      muestra: mejorColor.partidas,
      confianza: confianzaDe(mejorColor.partidas, MINIMO.partidas),
    });
  }

  return fuertes;
}

function detectarDebiles(informes: InformePartida[], ctx: Contexto): Hallazgo[] {
  const debiles: Hallazgo[] = [];
  if (informes.length < MINIMO.partidas) return debiles;

  // Patrones que se repiten en al menos un tercio de las partidas.
  const porEtiqueta = new Map<Etiqueta, { veces: number; partidas: number }>();
  for (const informe of informes) {
    for (const [nombre, veces] of Object.entries(informe.resumen[informe.colorJugador].etiquetas)) {
      if (!veces) continue;
      const etiqueta = nombre as Etiqueta;
      const previo = porEtiqueta.get(etiqueta) ?? { veces: 0, partidas: 0 };
      porEtiqueta.set(etiqueta, { veces: previo.veces + veces, partidas: previo.partidas + 1 });
    }
  }

  const umbral = Math.max(2, Math.ceil(informes.length / 3));
  for (const [etiqueta, d] of [...porEtiqueta.entries()]
    .filter(([e, d]) => e in DESCRIPCIONES && d.partidas >= umbral)
    .sort((a, b) => b[1].partidas - a[1].partidas)
    .slice(0, 4)) {
    debiles.push({
      id: `etiqueta-${etiqueta}`,
      titulo: DESCRIPCIONES[etiqueta],
      detalle: 'Se repite lo suficiente como para que no sea mala suerte: es un habito.',
      evidencia: `en ${d.partidas} de tus ${informes.length} partidas`,
      muestra: d.partidas,
      confianza: confianzaDe(d.partidas, MINIMO.partidas),
    });
  }

  const peorFase = compararFases(ctx, 'peor');
  if (peorFase) debiles.push(peorFase);

  if (ctx.castigo && ctx.castigo.ocasiones >= MINIMO.ocasiones) {
    const ratio = ctx.castigo.aprovechadas / ctx.castigo.ocasiones;
    if (ratio < 0.4) {
      debiles.push({
        id: 'castigo-bajo',
        titulo: 'Se te escapan los fallos del rival',
        detalle:
          'Cuando el rival se equivoca no sueles encontrar la jugada que lo aprovecha. Acostumbrate a parar y buscar cuando su jugada te sorprenda.',
        evidencia: `solo ${ctx.castigo.aprovechadas} de ${ctx.castigo.ocasiones} ocasiones aprovechadas`,
        muestra: ctx.castigo.ocasiones,
        confianza: confianzaDe(ctx.castigo.ocasiones, MINIMO.ocasiones),
      });
    }
  }

  for (const color of COLORES) {
    const p = ctx.porColor[color];
    if (p.partidas < MINIMO.partidas) continue;
    if (p.dispersionRepertorio >= 0.8) {
      debiles.push({
        id: `repertorio-${color}`,
        titulo: `No tienes repertorio con ${NOMBRE_COLOR[color]}`,
        detalle:
          'Casi cada partida empieza con una apertura distinta, asi que nunca acumulas experiencia en las mismas posiciones. Elegir una y repetirla es la mejora mas rapida que existe.',
        evidencia: `${Math.round(p.dispersionRepertorio * 100)}% de tus partidas con ${NOMBRE_COLOR[color]} son aperturas distintas`,
        muestra: p.partidas,
        confianza: confianzaDe(p.partidas, MINIMO.partidas),
      });
    }
  }

  return debiles;
}

/** La fase mejor o peor respecto a la media del propio jugador. */
function compararFases(ctx: Contexto, cual: 'mejor' | 'peor'): Hallazgo | null {
  const totales = FASES.map((f) => {
    const jugadas = COLORES.reduce((n, c) => n + ctx.porColor[c].perdidaPorFase[f].jugadas, 0);
    const suma = COLORES.reduce(
      (n, c) =>
        n + ctx.porColor[c].perdidaPorFase[f].perdidaMedia * ctx.porColor[c].perdidaPorFase[f].jugadas,
      0,
    );
    return { fase: f, jugadas, perdida: jugadas === 0 ? 0 : suma / jugadas };
  }).filter((t) => t.jugadas >= MINIMO.jugadasFase);

  if (totales.length < 2) return null;

  const ordenadas = [...totales].sort((a, b) => a.perdida - b.perdida);
  const elegida = cual === 'mejor' ? ordenadas[0]! : ordenadas[ordenadas.length - 1]!;
  const otra = cual === 'mejor' ? ordenadas[ordenadas.length - 1]! : ordenadas[0]!;

  // Sin una diferencia clara no hay nada que contar.
  if (Math.abs(elegida.perdida - otra.perdida) < 15) return null;

  return {
    id: `fase-${cual}-${elegida.fase}`,
    titulo:
      cual === 'mejor'
        ? `Tu mejor fase es ${NOMBRE_FASE[elegida.fase]}`
        : `Donde mas pierdes es ${NOMBRE_FASE[elegida.fase]}`,
    detalle:
      cual === 'mejor'
        ? 'Es donde menos ventaja regalas por jugada. Llevar la partida hacia ahi juega a tu favor.'
        : 'Es donde mas ventaja regalas por jugada, con diferencia sobre el resto.',
    evidencia: `${Math.round(elegida.perdida)} centipeones por jugada sobre ${elegida.jugadas} jugadas`,
    muestra: elegida.jugadas,
    confianza: confianzaDe(elegida.jugadas, MINIMO.jugadasFase),
  };
}

/* ------------------------------------------------------------------ */
/* Plan                                                                */
/* ------------------------------------------------------------------ */

function construirPlan(informes: InformePartida[], ctx: Contexto): Consejo[] {
  const plan: Consejo[] = [];

  if (informes.length < MINIMO.partidas) {
    plan.push({
      titulo: `Analiza ${MINIMO.partidas - informes.length} partidas mas`,
      detalle: `Con ${informes.length} ${informes.length === 1 ? 'partida' : 'partidas'} cualquier conclusion seria casualidad. A partir de ${MINIMO.partidas} empiezan a aparecer patrones reales, y cuantas mas, mas fiables.`,
      prioridad: 1,
    });
    return plan;
  }

  for (const debil of detectarDebiles(informes, ctx).slice(0, 2)) {
    plan.push({ titulo: debil.titulo, detalle: `${debil.detalle} (${debil.evidencia}).`, prioridad: 1 });
  }

  // Apertura floja con suficientes partidas: merece estudio o cambio.
  for (const color of COLORES) {
    const floja = ctx.porColor[color].aperturas
      .filter((a) => a.partidas >= MINIMO.partidasApertura && a.desviacion <= -5)
      .sort((a, b) => a.desviacion - b.desviacion)[0];
    if (!floja) continue;

    plan.push({
      titulo: `Estudia ${floja.nombre} o cambia de sistema`,
      detalle: `Con ${NOMBRE_COLOR[color]} la juegas ${floja.partidas} veces y rindes ${Math.abs(floja.desviacion)} puntos por debajo de tu media (${floja.precisionMedia}%). O aprendes sus planes, o eliges otra cosa.`,
      prioridad: 2,
    });
  }

  const mejorArma = COLORES.flatMap((c) =>
    ctx.porColor[c].aperturas
      .filter((a) => a.partidas >= MINIMO.partidasApertura && a.desviacion >= 3)
      .map((a) => ({ color: c, ...a })),
  ).sort((a, b) => b.desviacion - a.desviacion)[0];

  if (mejorArma) {
    plan.push({
      titulo: `Apoyate en ${mejorArma.nombre}`,
      detalle: `Con ${NOMBRE_COLOR[mejorArma.color]} es donde mejor rindes: ${mejorArma.precisionMedia}% en ${mejorArma.partidas} partidas. Profundizar en lo que ya se te da bien rinde mas que empezar de cero.`,
      prioridad: 2,
    });
  }

  plan.push({
    titulo: 'Sigue analizando',
    detalle:
      'Cada partida nueva afina el perfil. Las conclusiones marcadas con confianza baja necesitan mas datos para ser fiables.',
    prioridad: 3,
  });

  return plan.sort((a, b) => a.prioridad - b.prioridad);
}

function perfilVacio(): PerfilJugador {
  const colorVacio = (color: Color): PerfilColor => ({
    color,
    partidas: 0,
    precisionMedia: 0,
    rendimiento: 0,
    perdidaPorFase: Object.fromEntries(
      FASES.map((f) => [f, { jugadas: 0, perdidaMedia: 0 }]),
    ) as PerfilColor['perdidaPorFase'],
    erroresFrecuentes: [],
    aperturas: [],
    dispersionRepertorio: 0,
  });

  return {
    partidas: 0,
    desde: null,
    precisionMedia: 0,
    tendencia: null,
    precisionPorPartida: [],
    aciertoMejor: 0,
    castigo: null,
    solidez: { partidas: 0, sinGraves: 0 },
    fuertes: [],
    debiles: [],
    porColor: { w: colorVacio('w'), b: colorVacio('b') },
    plan: [
      {
        titulo: 'Analiza tu primera partida',
        detalle: 'El perfil se construye a partir de tus partidas analizadas.',
        prioridad: 1,
      },
    ],
    informeIa: null,
  };
}
