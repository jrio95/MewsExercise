import type {
  Color,
  Consejo,
  EstadisticasGlobales,
  Etiqueta,
  Fase,
  InformePartida,
  PartidaResumida,
} from '../types.js';
import { DESCRIPCIONES } from '../analysis/tags.js';
import { generarConsejos } from '../analysis/explain.js';
import { redondear } from '../analysis/scoring.js';
import { getDb } from './index.js';

const FASES: Fase[] = ['apertura', 'medio', 'final'];

interface FilaPartida {
  id: string;
  creado_en: string;
  blancas: string;
  negras: string;
  resultado: string;
  color_jugador: string;
  eco: string | null;
  apertura: string | null;
  precision: number;
  graves: number;
  errores: number;
  imprecisiones: number;
}

/** Guarda el informe completo y sus agregados derivados en una sola transaccion. */
export function guardarPartida(usuario: string, informe: InformePartida): void {
  const db = getDb();
  const resumen = informe.resumen[informe.colorJugador];

  const insertar = db.transaction(() => {
    db.prepare(
      `INSERT OR REPLACE INTO partidas
       (id, usuario, creado_en, blancas, negras, resultado, color_jugador, eco, apertura,
        precision, graves, errores, imprecisiones, nivel, pgn, informe)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      informe.id,
      usuario,
      informe.creadoEn,
      informe.blancas,
      informe.negras,
      informe.resultado,
      informe.colorJugador,
      informe.apertura?.eco ?? null,
      informe.apertura?.nombre ?? null,
      resumen.precision,
      resumen.conteo.grave,
      resumen.conteo.error,
      resumen.conteo.imprecision,
      informe.nivel,
      informe.pgn,
      JSON.stringify(informe),
    );

    const etiqueta = db.prepare(
      'INSERT OR REPLACE INTO etiquetas (partida_id, usuario, etiqueta, veces) VALUES (?, ?, ?, ?)',
    );
    for (const [nombre, veces] of Object.entries(resumen.etiquetas)) {
      if (veces) etiqueta.run(informe.id, usuario, nombre, veces);
    }

    const fase = db.prepare(
      'INSERT OR REPLACE INTO fases (partida_id, usuario, fase, jugadas, perdida_media) VALUES (?, ?, ?, ?, ?)',
    );
    for (const f of FASES) {
      const datos = resumen.perdidaPorFase[f];
      if (datos.jugadas > 0) fase.run(informe.id, usuario, f, datos.jugadas, datos.perdidaMedia);
    }
  });

  insertar();
}

export function listarPartidas(usuario: string, limite = 50, desplazamiento = 0): PartidaResumida[] {
  const filas = getDb()
    .prepare(
      `SELECT id, creado_en, blancas, negras, resultado, color_jugador, eco, apertura,
              precision, graves, errores, imprecisiones
       FROM partidas WHERE usuario = ?
       ORDER BY creado_en DESC LIMIT ? OFFSET ?`,
    )
    .all(usuario, limite, desplazamiento) as FilaPartida[];

  return filas.map((f) => ({
    id: f.id,
    creadoEn: f.creado_en,
    blancas: f.blancas,
    negras: f.negras,
    resultado: f.resultado,
    colorJugador: f.color_jugador as 'w' | 'b',
    apertura: f.apertura,
    eco: f.eco,
    precision: f.precision,
    graves: f.graves,
    errores: f.errores,
    imprecisiones: f.imprecisiones,
  }));
}

export function obtenerPartida(usuario: string, id: string): InformePartida | null {
  const fila = getDb()
    .prepare('SELECT informe FROM partidas WHERE usuario = ? AND id = ?')
    .get(usuario, id) as { informe: string } | undefined;
  return fila ? (JSON.parse(fila.informe) as InformePartida) : null;
}

export function borrarPartida(usuario: string, id: string): boolean {
  const db = getDb();
  const borrar = db.transaction(() => {
    db.prepare('DELETE FROM etiquetas WHERE partida_id = ? AND usuario = ?').run(id, usuario);
    db.prepare('DELETE FROM fases WHERE partida_id = ? AND usuario = ?').run(id, usuario);
    return db.prepare('DELETE FROM partidas WHERE id = ? AND usuario = ?').run(id, usuario);
  });
  return borrar().changes > 0;
}

/**
 * Guarda la explicación razonada de una jugada dentro del informe.
 *
 * Se cachea porque cada explicación es una llamada de pago al modelo: sin esto,
 * volver atrás en el repaso la pediría otra vez.
 */
export function guardarPorQue(
  usuario: string,
  id: string,
  ply: number,
  porQue: string,
): InformePartida | null {
  const informe = obtenerPartida(usuario, id);
  if (!informe) return null;

  const jugada = informe.jugadas.find((j) => j.ply === ply);
  if (!jugada) return null;
  jugada.porQue = porQue;

  getDb()
    .prepare('UPDATE partidas SET informe = ? WHERE id = ? AND usuario = ?')
    .run(JSON.stringify(informe), id, usuario);

  return informe;
}

/**
 * Rehace una partida guardada desde el otro bando.
 *
 * El informe ya contiene el analisis de los dos colores, asi que cambiar de
 * lado no exige volver a pasar el motor: basta con recalcular los consejos y
 * los agregados derivados. Hace falta porque, si el color se eligio mal, el
 * historico y las estadisticas quedarian contando los errores del rival como
 * propios.
 */
export function cambiarColor(usuario: string, id: string, color: Color): InformePartida | null {
  const informe = obtenerPartida(usuario, id);
  if (!informe) return null;
  if (informe.colorJugador === color) return informe;

  const corregido: InformePartida = {
    ...informe,
    colorJugador: color,
    consejos: generarConsejos(
      informe.resumen[color],
      informe.jugadas.filter((j) => j.color === color),
      informe.apertura?.consejo ?? null,
    ),
  };

  const db = getDb();
  db.transaction(() => {
    // Las filas derivadas son del color anterior: hay que retirarlas antes de
    // reescribirlas, o se mezclarian las etiquetas de los dos bandos.
    db.prepare('DELETE FROM etiquetas WHERE partida_id = ? AND usuario = ?').run(id, usuario);
    db.prepare('DELETE FROM fases WHERE partida_id = ? AND usuario = ?').run(id, usuario);
    guardarPartida(usuario, corregido);
  })();

  return corregido;
}

/**
 * Agrega el historico del usuario para responder a "que hago mal una y otra vez".
 *
 * Todo sale de las tablas derivadas, no de releer los informes: el coste no
 * crece con el tamano de cada partida.
 */
export function calcularEstadisticas(usuario: string): EstadisticasGlobales {
  const db = getDb();

  const total = (
    db.prepare('SELECT COUNT(*) AS n FROM partidas WHERE usuario = ?').get(usuario) as { n: number }
  ).n;

  if (total === 0) {
    return {
      partidas: 0,
      precisionMedia: 0,
      precisionPorPartida: [],
      erroresFrecuentes: [],
      perdidaPorFase: {
        apertura: { jugadas: 0, perdidaMedia: 0 },
        medio: { jugadas: 0, perdidaMedia: 0 },
        final: { jugadas: 0, perdidaMedia: 0 },
      },
      aperturas: [],
      puntosDebiles: [],
    };
  }

  const precisiones = db
    .prepare('SELECT id, creado_en, precision FROM partidas WHERE usuario = ? ORDER BY creado_en ASC')
    .all(usuario) as { id: string; creado_en: string; precision: number }[];

  const etiquetas = db
    .prepare(
      `SELECT etiqueta, SUM(veces) AS veces, COUNT(DISTINCT partida_id) AS partidas
       FROM etiquetas WHERE usuario = ?
       GROUP BY etiqueta ORDER BY veces DESC`,
    )
    .all(usuario) as { etiqueta: string; veces: number; partidas: number }[];

  const fases = db
    .prepare(
      `SELECT fase, SUM(jugadas) AS jugadas,
              SUM(perdida_media * jugadas) / SUM(jugadas) AS perdida
       FROM fases WHERE usuario = ? GROUP BY fase`,
    )
    .all(usuario) as { fase: string; jugadas: number; perdida: number }[];

  const aperturas = db
    .prepare(
      `SELECT eco, apertura, COUNT(*) AS partidas, AVG(precision) AS precision,
              SUM(CASE WHEN (color_jugador = 'w' AND resultado = '1-0')
                         OR (color_jugador = 'b' AND resultado = '0-1') THEN 1 ELSE 0 END) AS victorias,
              SUM(CASE WHEN (color_jugador = 'w' AND resultado = '0-1')
                         OR (color_jugador = 'b' AND resultado = '1-0') THEN 1 ELSE 0 END) AS derrotas,
              SUM(CASE WHEN resultado = '1/2-1/2' THEN 1 ELSE 0 END) AS tablas
       FROM partidas WHERE usuario = ? AND eco IS NOT NULL
       GROUP BY eco, apertura ORDER BY partidas DESC, precision ASC LIMIT 15`,
    )
    .all(usuario) as {
    eco: string;
    apertura: string;
    partidas: number;
    precision: number;
    victorias: number;
    derrotas: number;
    tablas: number;
  }[];

  const perdidaPorFase = Object.fromEntries(
    FASES.map((f) => {
      const fila = fases.find((x) => x.fase === f);
      return [f, { jugadas: fila?.jugadas ?? 0, perdidaMedia: redondear(fila?.perdida ?? 0, 0) }];
    }),
  ) as Record<Fase, { jugadas: number; perdidaMedia: number }>;

  const erroresFrecuentes = etiquetas
    .filter((e) => e.etiqueta in DESCRIPCIONES)
    .map((e) => ({
      etiqueta: e.etiqueta as Etiqueta,
      veces: e.veces,
      partidas: e.partidas,
      descripcion: DESCRIPCIONES[e.etiqueta as Etiqueta],
    }));

  const precisionMedia = redondear(
    precisiones.reduce((a, p) => a + p.precision, 0) / precisiones.length,
  );

  return {
    partidas: total,
    precisionMedia,
    precisionPorPartida: precisiones.map((p) => ({
      id: p.id,
      creadoEn: p.creado_en,
      precision: p.precision,
    })),
    erroresFrecuentes,
    perdidaPorFase,
    aperturas: aperturas.map((a) => ({
      eco: a.eco,
      nombre: a.apertura,
      partidas: a.partidas,
      precisionMedia: redondear(a.precision),
      victorias: a.victorias,
      derrotas: a.derrotas,
      tablas: a.tablas,
    })),
    puntosDebiles: construirPuntosDebiles(total, erroresFrecuentes, perdidaPorFase, aperturas, precisiones),
  };
}

/** Traduce los agregados en un plan de entrenamiento priorizado. */
function construirPuntosDebiles(
  partidas: number,
  errores: { etiqueta: Etiqueta; veces: number; partidas: number; descripcion: string }[],
  fases: Record<Fase, { jugadas: number; perdidaMedia: number }>,
  aperturas: { eco: string; apertura: string; partidas: number; precision: number; derrotas: number }[],
  precisiones: { precision: number }[],
): Consejo[] {
  const out: Consejo[] = [];

  // Un patron es "cronico" cuando aparece en al menos un tercio de las partidas.
  const cronicos = errores.filter((e) => e.partidas >= Math.max(2, Math.ceil(partidas / 3)));
  for (const c of cronicos.slice(0, 4)) {
    out.push({
      titulo: c.descripcion,
      detalle: `Aparece en ${c.partidas} de tus ${partidas} partidas (${c.veces} ${c.veces === 1 ? 'vez' : 'veces'} en total). Es tu patron mas repetido: corregirlo es lo que mas puntos te va a dar.`,
      prioridad: 1,
    });
  }

  const nombresFase = { apertura: 'la apertura', medio: 'el medio juego', final: 'el final' } as const;
  const peor = FASES.filter((f) => fases[f].jugadas >= 10).sort(
    (a, b) => fases[b].perdidaMedia - fases[a].perdidaMedia,
  )[0];
  if (peor && fases[peor].perdidaMedia > 35) {
    out.push({
      titulo: `Tu fase mas floja es ${nombresFase[peor]}`,
      detalle: `Pierdes de media ${Math.round(fases[peor].perdidaMedia)} centipeones por jugada en ${nombresFase[peor]}, sobre ${fases[peor].jugadas} jugadas analizadas.`,
      prioridad: 2,
    });
  }

  const aperturaFloja = aperturas.filter((a) => a.partidas >= 3).sort((a, b) => a.precision - b.precision)[0];
  if (aperturaFloja && aperturaFloja.precision < 75) {
    out.push({
      titulo: `Rindes por debajo de tu media en ${aperturaFloja.apertura}`,
      detalle: `${aperturaFloja.partidas} partidas con una precision media del ${redondear(aperturaFloja.precision)}% y ${aperturaFloja.derrotas} derrota${aperturaFloja.derrotas === 1 ? '' : 's'}. O estudias sus planes tipicos, o cambias de repertorio.`,
      prioridad: 2,
    });
  }

  if (precisiones.length >= 6) {
    const mitad = Math.floor(precisiones.length / 2);
    const antes = precisiones.slice(0, mitad).reduce((a, p) => a + p.precision, 0) / mitad;
    const ahora =
      precisiones.slice(mitad).reduce((a, p) => a + p.precision, 0) / (precisiones.length - mitad);
    if (ahora - antes >= 3) {
      out.push({
        titulo: 'Vas mejorando',
        detalle: `Tu precision media ha subido de ${redondear(antes)}% a ${redondear(ahora)}% entre la primera y la segunda mitad de tus partidas guardadas.`,
        prioridad: 3,
      });
    } else if (antes - ahora >= 3) {
      out.push({
        titulo: 'Has bajado el rendimiento',
        detalle: `Tu precision media ha caido de ${redondear(antes)}% a ${redondear(ahora)}%. Suele pasar al jugar mas rapido o mas cansado que de costumbre.`,
        prioridad: 3,
      });
    }
  }

  return out.sort((a, b) => a.prioridad - b.prioridad);
}
