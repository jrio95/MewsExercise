/** Tipos compartidos entre el servidor y la web (la web los importa via alias @shared). */

export type Color = 'w' | 'b';

/** Calidad de una jugada, de mejor a peor. */
export type Calidad =
  | 'mejor'        // coincide con la jugada del motor
  | 'excelente'    // practicamente equivalente
  | 'buena'
  | 'imprecision'  // inaccuracy
  | 'error'        // mistake
  | 'grave';       // blunder

/** Fase de la partida. */
export type Fase = 'apertura' | 'medio' | 'final';

/** Patrones de error detectados en una jugada concreta. */
export type EtiquetaJugada =
  | 'mate_perdido'
  | 'mate_permitido'
  | 'pieza_colgada'
  | 'material_perdido'
  | 'error_apertura'
  | 'error_medio'
  | 'error_final';

/** Habitos detectados a nivel de partida completa. */
export type EtiquetaHabito =
  | 'sin_enrocar'
  | 'dama_temprana'
  | 'desarrollo_lento'
  | 'misma_pieza_repetida'
  | 'peones_rey_debilitados';

export type Etiqueta = EtiquetaJugada | EtiquetaHabito;

export interface Evaluacion {
  /** Centipeones desde el punto de vista de las blancas. null si hay mate forzado. */
  cp: number | null;
  /** Mate en N desde el punto de vista de las blancas (positivo = ganan blancas). */
  mate: number | null;
}

export interface JugadaAnalizada {
  ply: number;              // 1-indexado
  numeroJugada: number;     // numero de jugada en notacion (1, 1, 2, 2, ...)
  color: Color;
  san: string;
  uci: string;
  fenAntes: string;
  fenDespues: string;

  evalAntes: Evaluacion;
  evalDespues: Evaluacion;

  /** Perdida en centipeones respecto a la mejor jugada (>= 0). */
  perdidaCp: number;
  /** Caida en probabilidad de victoria, en puntos porcentuales (>= 0). */
  perdidaWin: number;
  /** Precision de esta jugada, 0-100. */
  precision: number;
  calidad: Calidad;
  fase: Fase;

  /** Mejor jugada del motor en la posicion previa, en SAN. */
  mejorJugadaSan: string | null;
  /** La misma jugada en UCI, para poder dibujar la flecha en el tablero. */
  mejorJugadaUci: string | null;
  /** Continuacion recomendada en SAN, hasta 6 medias jugadas. */
  mejorLineaSan: string[];

  etiquetas: EtiquetaJugada[];
  /** Explicacion en lenguaje natural generada a partir de los datos del motor. */
  comentario: string | null;
  /**
   * Razonamiento del modelo sobre por que la jugada falla o funciona. Se genera
   * bajo demanda y se guarda en el informe para no volver a pedirlo.
   */
  porQue?: string | null;
}

export interface ResumenColor {
  precision: number;
  perdidaCpMedia: number;
  conteo: Record<Calidad, number>;
  perdidaPorFase: Record<Fase, { jugadas: number; perdidaMedia: number }>;
  etiquetas: Partial<Record<Etiqueta, number>>;
  habitos: EtiquetaHabito[];
}

export interface Apertura {
  eco: string;
  nombre: string;
  /** Ply hasta el que la partida siguio teoria conocida. */
  plyLibro: number;
  /** Primera jugada que se salio del libro, en SAN. */
  primeraFueraDeLibro: string | null;
  consejo: string;
}

export interface Consejo {
  titulo: string;
  detalle: string;
  /** 1 = maxima prioridad. */
  prioridad: number;
}

export interface InformePartida {
  id: string;
  creadoEn: string;
  nivel: string;
  profundidad: number;

  cabeceras: Record<string, string>;
  blancas: string;
  negras: string;
  resultado: string;
  /** Color desde el que se ofrece el coaching. */
  colorJugador: Color;

  apertura: Apertura | null;
  jugadas: JugadaAnalizada[];
  resumen: Record<Color, ResumenColor>;
  consejos: Consejo[];
  /** Narrativa opcional generada por IA (solo si hay ANTHROPIC_API_KEY). */
  narrativa: string | null;
  pgn: string;
}

/** Fila reducida para el listado de historico. */
export interface PartidaResumida {
  id: string;
  creadoEn: string;
  blancas: string;
  negras: string;
  resultado: string;
  colorJugador: Color;
  apertura: string | null;
  eco: string | null;
  precision: number;
  graves: number;
  errores: number;
  imprecisiones: number;
}

export interface EstadisticasGlobales {
  partidas: number;
  precisionMedia: number;
  precisionPorPartida: { id: string; creadoEn: string; precision: number }[];
  erroresFrecuentes: { etiqueta: Etiqueta; veces: number; partidas: number; descripcion: string }[];
  perdidaPorFase: Record<Fase, { jugadas: number; perdidaMedia: number }>;
  aperturas: {
    eco: string;
    nombre: string;
    partidas: number;
    precisionMedia: number;
    victorias: number;
    derrotas: number;
    tablas: number;
  }[];
  puntosDebiles: Consejo[];
}
