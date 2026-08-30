import type { Color, Fase, InformePartida, PartidaResumida } from '../types.js';
import { generarConsejos } from '../analysis/explain.js';
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

/** Origen de una partida importada, para no volver a analizarla. */
export interface Origen {
  fuente: string;
  fuenteId: string;
}

/** Guarda el informe completo y sus agregados derivados en una sola transaccion. */
export function guardarPartida(usuario: string, informe: InformePartida, origen?: Origen): void {
  const db = getDb();
  const resumen = informe.resumen[informe.colorJugador];

  const insertar = db.transaction(() => {
    db.prepare(
      `INSERT OR REPLACE INTO partidas
       (id, usuario, creado_en, blancas, negras, resultado, color_jugador, eco, apertura,
        precision, graves, errores, imprecisiones, nivel, pgn, informe, fuente, fuente_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      origen?.fuente ?? null,
      origen?.fuenteId ?? null,
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

/** Informe del entrenador guardado, si sigue valiendo para el numero de partidas actual. */
export function informeGuardado(usuario: string, partidas: number): string | null {
  const fila = getDb()
    .prepare('SELECT texto, partidas FROM informes_perfil WHERE usuario = ?')
    .get(usuario) as { texto: string; partidas: number } | undefined;

  return fila && fila.partidas === partidas ? fila.texto : null;
}

export function guardarInformePerfil(usuario: string, partidas: number, texto: string): void {
  getDb()
    .prepare(
      `INSERT INTO informes_perfil (usuario, partidas, generado_en, texto)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (usuario) DO UPDATE
         SET partidas = excluded.partidas,
             generado_en = excluded.generado_en,
             texto = excluded.texto`,
    )
    .run(usuario, partidas, new Date().toISOString(), texto);
}

/**
 * Informes completos del usuario, del mas reciente al mas antiguo.
 *
 * El perfil necesita el detalle jugada a jugada, que no esta en las tablas
 * agregadas. Se topa el numero de partidas porque cada informe ocupa decenas de
 * kilobytes: leer un historial ilimitado en cada peticion no escalaria.
 */
export function informesDe(usuario: string, limite = 200): InformePartida[] {
  const filas = getDb()
    .prepare('SELECT informe FROM partidas WHERE usuario = ? ORDER BY creado_en DESC LIMIT ?')
    .all(usuario, limite) as { informe: string }[];

  return filas.flatMap((f) => {
    try {
      return [JSON.parse(f.informe) as InformePartida];
    } catch {
      // Un informe corrupto no debe tumbar el perfil entero.
      return [];
    }
  });
}

/**
 * De una lista de identificadores de origen, cuales ya estan analizados y con
 * que partida se corresponden.
 *
 * Devuelve el id local, y no solo si existe, para que el listado de importacion
 * pueda ofrecer abrir el informe que ya hay en vez de dejar la fila muerta.
 */
export function yaImportadas(usuario: string, fuenteIds: string[]): Map<string, string> {
  if (fuenteIds.length === 0) return new Map();

  const huecos = fuenteIds.map(() => '?').join(',');
  const filas = getDb()
    .prepare(
      `SELECT id, fuente_id FROM partidas WHERE usuario = ? AND fuente_id IN (${huecos})`,
    )
    .all(usuario, ...fuenteIds) as { id: string; fuente_id: string }[];

  return new Map(filas.map((f) => [f.fuente_id, f.id]));
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
