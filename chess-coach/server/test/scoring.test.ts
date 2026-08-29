import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aPerspectivaBlancas,
  clasificar,
  cpDesde,
  precisionDeJugada,
  precisionGlobal,
  winPercent,
} from '../src/analysis/scoring.js';
import { parseSearch } from '../src/engine/uci.js';

test('parseSearch se queda con la evaluacion de mayor profundidad', () => {
  const r = parseSearch([
    'info depth 1 score cp 20 pv e2e4',
    'info depth 12 score cp 35 pv e2e4 e7e5 g1f3',
    'bestmove e2e4 ponder e7e5',
  ]);
  assert.equal(r.cp, 35);
  assert.equal(r.mate, null);
  assert.equal(r.depth, 12);
  assert.equal(r.bestMove, 'e2e4');
  assert.deepEqual(r.pv, ['e2e4', 'e7e5', 'g1f3']);
});

test('parseSearch entiende posiciones sin jugada legal', () => {
  const r = parseSearch(['info depth 0 score mate 0', 'bestmove (none)']);
  assert.equal(r.mate, 0);
  assert.equal(r.bestMove, null);
});

test('la perspectiva se invierte cuando mueven las negras', () => {
  assert.deepEqual(aPerspectivaBlancas({ cp: 120, mate: null, bestMove: null, pv: [], depth: 1 }, 'b'), {
    cp: -120,
    mate: null,
  });
  assert.deepEqual(aPerspectivaBlancas({ cp: null, mate: 3, bestMove: null, pv: [], depth: 1 }, 'b'), {
    cp: null,
    mate: -3,
  });
});

test('mate 0 significa que el bando que mueve esta mateado, no ventaja para el', () => {
  // Blancas dan mate: en la posicion resultante mueven las negras y estan mateadas.
  const tras = aPerspectivaBlancas({ cp: null, mate: 0, bestMove: null, pv: [], depth: 0 }, 'b');
  assert.ok(tras.mate !== null && tras.mate > 0, 'debe leerse como mate a favor de las blancas');
  assert.ok(cpDesde(tras, 'w') > 9000);
  assert.ok(cpDesde(tras, 'b') < -9000);
});

test('un mate mas corto vale mas que uno mas largo', () => {
  assert.ok(cpDesde({ cp: null, mate: 1 }, 'w') > cpDesde({ cp: null, mate: 5 }, 'w'));
});

test('winPercent es monotona y esta centrada en 50', () => {
  assert.equal(Math.round(winPercent(0)), 50);
  assert.ok(winPercent(300) > winPercent(100));
  assert.ok(winPercent(-300) < 50);
  assert.equal(winPercent(20000), 100);
  assert.equal(winPercent(-20000), 0);
});

test('la jugada del motor siempre se clasifica como la mejor', () => {
  assert.equal(clasificar(0, true), 'mejor');
  assert.equal(clasificar(45, true), 'mejor', 'aunque la evaluacion oscile por el horizonte de busqueda');
});

test('clasificar aplica los umbrales de caida de probabilidad de victoria', () => {
  assert.equal(clasificar(0.5, false), 'excelente');
  assert.equal(clasificar(3, false), 'buena');
  assert.equal(clasificar(7, false), 'imprecision');
  assert.equal(clasificar(12, false), 'error');
  assert.equal(clasificar(35, false), 'grave');
});

test('precisionDeJugada va de 100 a 0 segun la caida', () => {
  assert.equal(Math.round(precisionDeJugada(0)), 100);
  assert.ok(precisionDeJugada(10) < precisionDeJugada(2));
  assert.ok(precisionDeJugada(100) < 5);
});

test('precisionGlobal castiga un error grave aislado mas que la media simple', () => {
  const casi = Array(19).fill(99);
  const curva = Array(20).fill(50).map((v, i) => v + i);
  const conError = precisionGlobal([...casi, 5], curva);
  const sinError = precisionGlobal([...casi, 99], curva);
  assert.ok(conError < sinError - 10, `esperaba una caida clara, obtuve ${conError} vs ${sinError}`);
  assert.ok(conError > 0 && conError < 100);
});

test('precisionGlobal no divide por cero con una partida perfecta', () => {
  const r = precisionGlobal([100, 100, 100], [50, 50, 50, 50]);
  assert.ok(r > 99 && r <= 100);
});
