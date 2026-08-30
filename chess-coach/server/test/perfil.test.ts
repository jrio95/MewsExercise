import { test } from 'node:test';
import assert from 'node:assert/strict';
import { construirPerfil } from '../src/analysis/perfil.js';
import type {
  Calidad,
  Color,
  Etiqueta,
  InformePartida,
  JugadaAnalizada,
  ResumenColor,
} from '../src/types.js';

/* Informes sinteticos: el perfil es aritmetica sobre datos ya calculados, asi
   que no hace falta el motor y las pruebas son deterministas. */

function jugada(color: Color, calidad: Calidad, ply: number): JugadaAnalizada {
  return {
    ply,
    numeroJugada: Math.ceil(ply / 2),
    color,
    san: 'e4',
    uci: 'e2e4',
    fenAntes: '',
    fenDespues: '',
    evalAntes: { cp: 0, mate: null },
    evalDespues: { cp: 0, mate: null },
    perdidaCp: 0,
    perdidaWin: 0,
    precision: 100,
    calidad,
    fase: 'medio',
    mejorJugadaSan: null,
    mejorJugadaUci: null,
    mejorLineaSan: [],
    etiquetas: [],
    comentario: null,
  };
}

interface Opciones {
  color?: Color;
  precision?: number;
  resultado?: string;
  eco?: string;
  nombre?: string;
  graves?: number;
  etiquetas?: Partial<Record<Etiqueta, number>>;
  fases?: Partial<Record<'apertura' | 'medio' | 'final', { jugadas: number; perdidaMedia: number }>>;
  jugadas?: JugadaAnalizada[];
  creadoEn?: string;
}

function resumen(o: Opciones, mio: boolean): ResumenColor {
  const base = { jugadas: 0, perdidaMedia: 0 };
  return {
    precision: mio ? (o.precision ?? 80) : 75,
    perdidaCpMedia: 0,
    conteo: {
      mejor: 0,
      excelente: 0,
      buena: 0,
      imprecision: 0,
      error: 0,
      grave: mio ? (o.graves ?? 0) : 0,
    },
    perdidaPorFase: {
      apertura: o.fases?.apertura ?? base,
      medio: o.fases?.medio ?? base,
      final: o.fases?.final ?? base,
    },
    etiquetas: mio ? (o.etiquetas ?? {}) : {},
    habitos: [],
  };
}

let contador = 0;
function informe(o: Opciones = {}): InformePartida {
  const color = o.color ?? 'w';
  contador++;
  return {
    id: `p${contador}`,
    creadoEn: o.creadoEn ?? `2026-01-${String(contador).padStart(2, '0')}T10:00:00.000Z`,
    nivel: 'rapido',
    profundidad: 14,
    cabeceras: {},
    blancas: 'yo',
    negras: 'rival',
    resultado: o.resultado ?? '1-0',
    colorJugador: color,
    apertura: o.eco
      ? { eco: o.eco, nombre: o.nombre ?? o.eco, plyLibro: 4, primeraFueraDeLibro: null, consejo: '' }
      : null,
    jugadas: o.jugadas ?? [],
    resumen: {
      w: resumen(o, color === 'w'),
      b: resumen(o, color === 'b'),
    },
    consejos: [],
    narrativa: null,
    pgn: '',
  };
}

const cuatro = (o: Opciones = {}) => [informe(o), informe(o), informe(o), informe(o)];

test('sin partidas el perfil no inventa nada', () => {
  const p = construirPerfil([]);
  assert.equal(p.partidas, 0);
  assert.deepEqual(p.fuertes, []);
  assert.deepEqual(p.debiles, []);
  assert.equal(p.plan.length, 1);
  assert.match(p.plan[0]!.titulo, /primera partida/i);
});

test('con muy pocas partidas no se saca ninguna conclusion', () => {
  const p = construirPerfil([informe({ graves: 3 }), informe({ graves: 3 })]);
  assert.equal(p.partidas, 2);
  assert.deepEqual(p.fuertes, [], 'dos partidas no bastan para afirmar nada');
  assert.deepEqual(p.debiles, []);
  assert.match(p.plan[0]!.titulo, /Analiza 2 partidas mas/);
});

test('mide cuantos fallos del rival aprovechas', () => {
  // El rival falla tres veces; las respondes bien dos.
  const jugadas = [
    jugada('b', 'grave', 1),
    jugada('w', 'mejor', 2),
    jugada('b', 'error', 3),
    jugada('w', 'excelente', 4),
    jugada('b', 'grave', 5),
    jugada('w', 'imprecision', 6),
  ];
  const p = construirPerfil([informe({ color: 'w', jugadas })]);
  assert.deepEqual(p.castigo, { ocasiones: 3, aprovechadas: 2 });
});

test('los fallos propios no cuentan como ocasiones de castigo', () => {
  const jugadas = [jugada('w', 'grave', 1), jugada('b', 'mejor', 2)];
  assert.equal(construirPerfil([informe({ color: 'w', jugadas })]).castigo, null);
});

test('aprovechar los fallos del rival aparece como punto fuerte', () => {
  const jugadas = Array.from({ length: 12 }, (_, i) =>
    i % 2 === 0 ? jugada('b', 'grave', i + 1) : jugada('w', 'mejor', i + 1),
  );
  const p = construirPerfil(cuatro({ color: 'w', jugadas }));
  const fuerte = p.fuertes.find((f) => f.id === 'castigo');
  assert.ok(fuerte, 'deberia detectarse como fortaleza');
  assert.match(fuerte.evidencia, /24 de 24/);
  assert.equal(fuerte.confianza, 'alta');
});

test('dejar escapar los fallos del rival aparece como debilidad', () => {
  const jugadas = Array.from({ length: 12 }, (_, i) =>
    i % 2 === 0 ? jugada('b', 'grave', i + 1) : jugada('w', 'imprecision', i + 1),
  );
  const p = construirPerfil(cuatro({ color: 'w', jugadas }));
  assert.ok(p.debiles.some((d) => d.id === 'castigo-bajo'));
  assert.ok(!p.fuertes.some((f) => f.id === 'castigo'));
});

test('la solidez cuenta partidas sin errores graves', () => {
  const p = construirPerfil([...cuatro({ graves: 0 }), informe({ graves: 2 })]);
  assert.deepEqual(p.solidez, { partidas: 5, sinGraves: 4 });
  assert.ok(p.fuertes.some((f) => f.id === 'solidez'));
});

test('un habito repetido en un tercio de las partidas es una debilidad', () => {
  const p = construirPerfil([
    ...cuatro({ etiquetas: { sin_enrocar: 1 } }),
    informe({}),
    informe({}),
  ]);
  const debil = p.debiles.find((d) => d.id === 'etiqueta-sin_enrocar');
  assert.ok(debil);
  assert.match(debil.evidencia, /en 4 de tus 6 partidas/);
});

test('un fallo aislado no se convierte en habito', () => {
  const p = construirPerfil([informe({ etiquetas: { dama_temprana: 1 } }), ...cuatro({})]);
  assert.ok(!p.debiles.some((d) => d.id === 'etiqueta-dama_temprana'));
});

test('separa el rendimiento por color', () => {
  const p = construirPerfil([
    ...cuatro({ color: 'w', precision: 90, resultado: '1-0' }),
    ...cuatro({ color: 'b', precision: 70, resultado: '1-0' }),
  ]);

  assert.equal(p.porColor.w.partidas, 4);
  assert.equal(p.porColor.b.partidas, 4);
  assert.equal(p.porColor.w.precisionMedia, 90);
  assert.equal(p.porColor.b.precisionMedia, 70);
  // Con blancas gana todas; con negras las pierde todas.
  assert.equal(p.porColor.w.rendimiento, 1);
  assert.equal(p.porColor.b.rendimiento, 0);

  assert.ok(p.fuertes.some((f) => f.id === 'color-w'), 'debe notar que va mejor con blancas');
});

test('detecta la falta de repertorio', () => {
  const p = construirPerfil([
    informe({ color: 'w', eco: 'A00' }),
    informe({ color: 'w', eco: 'B01' }),
    informe({ color: 'w', eco: 'C20' }),
    informe({ color: 'w', eco: 'D02' }),
  ]);
  assert.equal(p.porColor.w.dispersionRepertorio, 1);
  assert.ok(p.debiles.some((d) => d.id === 'repertorio-w'));
});

test('repetir la misma apertura no se marca como falta de repertorio', () => {
  const p = construirPerfil(cuatro({ color: 'w', eco: 'C50', nombre: 'Italiana' }));
  assert.equal(p.porColor.w.dispersionRepertorio, 0.25);
  assert.ok(!p.debiles.some((d) => d.id === 'repertorio-w'));
  assert.equal(p.porColor.w.aperturas[0]!.partidas, 4);
});

test('agrupa las aperturas con resultados y desviacion sobre tu media', () => {
  const p = construirPerfil([
    ...cuatro({ color: 'w', eco: 'C50', nombre: 'Italiana', precision: 90, resultado: '1-0' }),
    ...cuatro({ color: 'w', eco: 'B20', nombre: 'Siciliana', precision: 60, resultado: '0-1' }),
  ]);

  const italiana = p.porColor.w.aperturas.find((a) => a.eco === 'C50');
  const siciliana = p.porColor.w.aperturas.find((a) => a.eco === 'B20');
  assert.ok(italiana && siciliana);

  assert.equal(italiana.victorias, 4);
  assert.equal(italiana.rendimiento, 1);
  assert.equal(siciliana.derrotas, 4);
  assert.equal(siciliana.rendimiento, 0);

  // La media del color es 75: una sube 15 y la otra baja 15.
  assert.equal(italiana.desviacion, 15);
  assert.equal(siciliana.desviacion, -15);

  // Y el plan debe recoger las dos caras.
  assert.ok(p.plan.some((c) => /Siciliana/.test(c.titulo)), 'la floja, para estudiarla');
  assert.ok(p.plan.some((c) => /Italiana/.test(c.titulo)), 'la buena, para apoyarse');
});

test('la fase se pondera por jugadas, no por partidas', () => {
  const p = construirPerfil([
    informe({ fases: { final: { jugadas: 40, perdidaMedia: 100 } } }),
    informe({ fases: { final: { jugadas: 4, perdidaMedia: 10 } } }),
  ]);
  // (40*100 + 4*10) / 44 = 91,8 -> 92. La media simple de las partidas seria 55.
  assert.equal(p.porColor.w.perdidaPorFase.final.perdidaMedia, 92);
});

test('la peor fase solo se declara si destaca de verdad', () => {
  const parecidas = construirPerfil(
    cuatro({
      fases: {
        apertura: { jugadas: 20, perdidaMedia: 50 },
        medio: { jugadas: 20, perdidaMedia: 55 },
      },
    }),
  );
  assert.ok(!parecidas.debiles.some((d) => d.id.startsWith('fase-peor')), 'diferencia irrelevante');

  const dispares = construirPerfil(
    cuatro({
      fases: {
        apertura: { jugadas: 20, perdidaMedia: 20 },
        medio: { jugadas: 20, perdidaMedia: 150 },
      },
    }),
  );
  assert.ok(dispares.debiles.some((d) => d.id === 'fase-peor-medio'));
  assert.ok(dispares.fuertes.some((f) => f.id === 'fase-mejor-apertura'));
});

test('una fase con pocas jugadas no se juzga', () => {
  const p = construirPerfil(
    cuatro({
      fases: {
        apertura: { jugadas: 20, perdidaMedia: 20 },
        final: { jugadas: 2, perdidaMedia: 900 },
      },
    }),
  );
  assert.ok(!p.debiles.some((d) => d.id.includes('final')), 'dos jugadas no son un final');
});

test('la tendencia compara la primera mitad con la segunda', () => {
  const p = construirPerfil([
    ...Array.from({ length: 4 }, () => informe({ precision: 60 })),
    ...Array.from({ length: 4 }, () => informe({ precision: 80 })),
  ]);
  assert.deepEqual(p.tendencia, { antes: 60, ahora: 80 });
  assert.ok(p.fuertes.some((f) => f.id === 'progreso'));
});

test('la confianza crece con el tamano de la muestra', () => {
  const pocas = construirPerfil(cuatro({ graves: 0 }));
  const muchas = construirPerfil(Array.from({ length: 20 }, () => informe({ graves: 0 })));

  const a = pocas.fuertes.find((f) => f.id === 'solidez')!;
  const b = muchas.fuertes.find((f) => f.id === 'solidez')!;
  assert.equal(a.confianza, 'baja');
  assert.equal(b.confianza, 'alta');
});

test('las partidas sin resultado no falsean el rendimiento', () => {
  const p = construirPerfil(cuatro({ color: 'w', resultado: '*' }));
  assert.equal(p.porColor.w.rendimiento, 0, 'sin resultados conocidos no se inventa una puntuacion');
  assert.equal(p.porColor.w.partidas, 4);
});

test('el perfil se ordena por fecha aunque lleguen desordenados', () => {
  const viejo = informe({ precision: 50, creadoEn: '2026-01-01T00:00:00.000Z' });
  const nuevo = informe({ precision: 90, creadoEn: '2026-06-01T00:00:00.000Z' });
  const p = construirPerfil([nuevo, viejo]);
  assert.equal(p.desde, '2026-01-01T00:00:00.000Z');
});
