import type { Calidad, Evaluacion, Fase } from '@shared';

export const ETIQUETA_CALIDAD: Record<Calidad, string> = {
  mejor: 'Mejor jugada',
  excelente: 'Excelente',
  buena: 'Buena',
  imprecision: 'Imprecision',
  error: 'Error',
  grave: 'Error grave',
};

export const SIMBOLO_CALIDAD: Record<Calidad, string> = {
  mejor: '★',
  excelente: '✓',
  buena: '·',
  imprecision: '?!',
  error: '?',
  grave: '??',
};

export const ETIQUETA_FASE: Record<Fase, string> = {
  apertura: 'Apertura',
  medio: 'Medio juego',
  final: 'Final',
};

/** Evaluacion legible, siempre desde el punto de vista de las blancas. */
export function formatearEval(ev: Evaluacion): string {
  if (ev.mate !== null) return `M${Math.abs(ev.mate)}${ev.mate > 0 ? '' : ' ✕'}`;
  if (ev.cp === null) return '—';
  const peones = ev.cp / 100;
  return `${peones >= 0 ? '+' : ''}${peones.toFixed(1)}`;
}

/** Posicion de la barra de evaluacion, 0 = ganan negras, 1 = ganan blancas. */
export function barraEval(ev: Evaluacion): number {
  if (ev.mate !== null) return ev.mate > 0 ? 1 : 0;
  if (ev.cp === null) return 0.5;
  return 1 / (1 + Math.exp(-0.004 * Math.max(-1000, Math.min(1000, ev.cp))));
}

export function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function nombreJugada(ply: number): string {
  return `${Math.ceil(ply / 2)}${ply % 2 === 1 ? '.' : '...'}`;
}

export function claseNota(precision: number): string {
  if (precision >= 90) return 'nota-alta';
  if (precision >= 75) return 'nota-media';
  return 'nota-baja';
}
