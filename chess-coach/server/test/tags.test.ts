import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import {
  defensaAbandonada,
  describirUci,
  detectarHabitos,
  etiquetarJugada,
  lineaASan,
} from '../src/analysis/tags.js';
import { detectarApertura } from '../src/analysis/openings.js';
import { calcularFinApertura, faseDe, materialNoPeonil } from '../src/analysis/phases.js';

const INICIAL = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

test('describirUci traduce a SAN y detecta capturas', () => {
  assert.equal(describirUci(INICIAL, 'e2e4')?.san, 'e4');
  const captura = describirUci('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', 'e4d5');
  assert.equal(captura?.san, 'exd5');
  assert.equal(captura?.captura, 'p');
  assert.equal(captura?.valorCaptura, 1);
});

test('describirUci devuelve null ante una jugada ilegal', () => {
  assert.equal(describirUci(INICIAL, 'e2e5'), null);
  assert.equal(describirUci(INICIAL, null), null);
  assert.equal(describirUci(INICIAL, 'xx'), null);
});

test('lineaASan convierte la linea principal y corta al llegar al tope', () => {
  const linea = lineaASan(INICIAL, ['e2e4', 'e7e5', 'g1f3', 'b8c6'], 3);
  assert.deepEqual(linea, ['e4', 'e5', 'Nf3']);
});

test('lineaASan se detiene si la linea deja de ser legal', () => {
  assert.deepEqual(lineaASan(INICIAL, ['e2e4', 'a1a8'], 6), ['e4']);
});

const jugadaNeutra = { san: 'Nf6', captura: null, valorCaptura: 0, desde: 'g8', hasta: 'f6' };
const POSICION = { fenAntes: INICIAL, fenDespues: INICIAL, color: 'b' as const };

test('etiqueta pieza colgada solo si el rival gana material de verdad', () => {
  const tags = etiquetarJugada({
    perdidaWin: 25,
    mateAntes: null,
    mateDespues: null,
    jugadaMotor: null,
    jugadaJugada: jugadaNeutra,
    respuestaRival: { san: 'Bxf6', captura: 'n', valorCaptura: 3, desde: 'g5', hasta: 'f6' },
    ...POSICION,
    fase: 'medio',
  });
  assert.ok(tags.includes('pieza_colgada'));

  const peon = etiquetarJugada({
    perdidaWin: 25,
    mateAntes: null,
    mateDespues: null,
    jugadaMotor: null,
    jugadaJugada: jugadaNeutra,
    respuestaRival: { san: 'gxh5', captura: 'p', valorCaptura: 1, desde: 'g4', hasta: 'h5' },
    ...POSICION,
    fase: 'medio',
  });
  assert.ok(!peon.includes('pieza_colgada'), 'un peon no cuenta como pieza colgada');
});

test('una buena jugada no recibe etiquetas de error', () => {
  const tags = etiquetarJugada({
    perdidaWin: 1,
    mateAntes: null,
    mateDespues: null,
    jugadaMotor: null,
    jugadaJugada: jugadaNeutra,
    respuestaRival: { san: 'Bxf6', captura: 'n', valorCaptura: 3, desde: 'g5', hasta: 'f6' },
    ...POSICION,
    fase: 'medio',
  });
  assert.deepEqual(tags, []);
});

test('detecta mate perdido y mate permitido', () => {
  const perdido = etiquetarJugada({
    perdidaWin: 40,
    mateAntes: 2,
    mateDespues: null,
    jugadaMotor: null,
    jugadaJugada: jugadaNeutra,
    respuestaRival: null,
    ...POSICION,
    fase: 'medio',
  });
  assert.ok(perdido.includes('mate_perdido'));

  const permitido = etiquetarJugada({
    perdidaWin: 60,
    mateAntes: null,
    mateDespues: -3,
    jugadaMotor: null,
    jugadaJugada: jugadaNeutra,
    respuestaRival: null,
    ...POSICION,
    fase: 'medio',
  });
  assert.ok(permitido.includes('mate_permitido'));
});

test('la etiqueta de fase acompana a todo error a partir de imprecision', () => {
  const base = {
    mateAntes: null,
    mateDespues: null,
    jugadaMotor: null,
    jugadaJugada: jugadaNeutra,
    respuestaRival: null,
    ...POSICION,
  };
  assert.ok(etiquetarJugada({ ...base, perdidaWin: 8, fase: 'apertura' }).includes('error_apertura'));
  assert.ok(etiquetarJugada({ ...base, perdidaWin: 8, fase: 'final' }).includes('error_final'));
  assert.deepEqual(etiquetarJugada({ ...base, perdidaWin: 3, fase: 'final' }), []);
});

function movimientosDe(pgn: string) {
  const c = new Chess();
  c.loadPgn(pgn);
  return c.history({ verbose: true }).map((m) => ({
    color: m.color as 'w' | 'b',
    san: m.san,
    piece: m.piece,
    from: m.from,
    to: m.to,
    captured: m.captured,
  }));
}

test('detecta dama temprana y desarrollo lento', () => {
  const mv = movimientosDe('1. e4 e5 2. Qh5 Nc6 3. Qf3 Nf6 4. Qg3 d5');
  const habitos = detectarHabitos(mv, 'w');
  assert.ok(habitos.includes('dama_temprana'));
  assert.ok(habitos.includes('misma_pieza_repetida'), 'la dama se movio tres veces');
  assert.ok(habitos.includes('desarrollo_lento'));
});

test('un desarrollo correcto no genera habitos negativos', () => {
  const mv = movimientosDe('1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O Nf6 5. d3 d6 6. Nc3 O-O 7. Be3 Be6');
  assert.deepEqual(detectarHabitos(mv, 'w'), []);
});

test('detecta no haber enrocado en una partida larga', () => {
  // Lista sintetica: la heuristica solo mira color/pieza/casillas, no legalidad.
  const mv = Array.from({ length: 40 }, (_, i) => ({
    color: (i % 2 === 0 ? 'w' : 'b') as 'w' | 'b',
    san: 'Rd1',
    piece: 'r',
    from: 'd1',
    to: 'd2',
    captured: undefined,
  }));
  assert.ok(detectarHabitos(mv, 'w').includes('sin_enrocar'));

  const corta = mv.slice(0, 6);
  assert.ok(!detectarHabitos(corta, 'w').includes('sin_enrocar'), 'una partida corta no cuenta');
});

test('identifica la apertura y donde se sale de teoria', () => {
  const ap = detectarApertura(['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6', 'Bg5', 'Qb6']);
  assert.ok(ap);
  assert.equal(ap.eco, 'B94');
  assert.match(ap.nombre, /Najdorf/);
  assert.equal(ap.plyLibro, 11, 'la coincidencia mas larga llega hasta Bg5');
  assert.equal(ap.primeraFueraDeLibro, 'Qb6');
});

test('se queda con la coincidencia mas larga, no con la primera', () => {
  const corta = detectarApertura(['e4', 'e5']);
  const larga = detectarApertura(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']);
  assert.ok(corta && larga);
  assert.ok(larga.plyLibro > corta.plyLibro);
  assert.match(larga.nombre, /Ruy Lopez|Spanish/);
});

test('devuelve null si no hay jugadas', () => {
  assert.equal(detectarApertura([]), null);
});

test('el material no peonil distingue apertura de final', () => {
  assert.equal(materialNoPeonil(INICIAL), 62);
  assert.equal(faseDe(INICIAL, 3, 20), 'apertura');
  assert.equal(faseDe(INICIAL, 30, 20), 'medio');
  assert.equal(faseDe('8/5k2/8/8/8/8/3K1R2/8 w - - 0 1', 60, 20), 'final');
});

test('la apertura termina cuando ambos bandos han desarrollado', () => {
  const fin = calcularFinApertura(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'O-O', 'Nf6']);
  assert.ok(fin >= 6 && fin <= 24, `fin de apertura inesperado: ${fin}`);
});

test('detecta que la jugada abandona la defensa de otra pieza', () => {
  // Posicion real de una partida del usuario: negras en jaque por Qb5+.
  // El alfil de c8 es el UNICO defensor del peon de b7. Al ir a d7 tapa el
  // jaque pero suelta b7, y las blancas responden Qxb7.
  const antes = 'rnbqkbnr/pp4pp/5p2/1Qp1p3/3pP3/5NP1/PPPP1PBP/RNB1K2R b KQkq - 0 6';
  const despues = 'rn1qkbnr/pp1b2pp/5p2/1Qp1p3/3pP3/5NP1/PPPP1PBP/RNB1K2R w KQkq - 1 7';

  const suelta = defensaAbandonada(antes, despues, 'b7', 'd7', 'b');
  assert.ok(suelta, 'deberia detectar que b7 se queda sin defensa');
  assert.equal(suelta.pieza, 'peon');
  assert.equal(suelta.casilla, 'b7');
});

test('no marca defensa abandonada si la pieza sigue defendida', () => {
  // Con Nc6 el alfil se queda en c8 y b7 sigue defendido.
  const antes = 'rnbqkbnr/pp4pp/5p2/1Qp1p3/3pP3/5NP1/PPPP1PBP/RNB1K2R b KQkq - 0 6';
  const despues = 'r1bqkbnr/pp4pp/2n2p2/1Qp1p3/3pP3/5NP1/PPPP1PBP/RNB1K2R w KQkq - 1 7';
  assert.equal(defensaAbandonada(antes, despues, 'b7', 'c6', 'b'), null);
});

test('colgar la pieza que acabas de mover no es defensa abandonada', () => {
  const antes = 'rnbqkbnr/pp4pp/5p2/1Qp1p3/3pP3/5NP1/PPPP1PBP/RNB1K2R b KQkq - 0 6';
  const despues = 'rn1qkbnr/pp1b2pp/5p2/1Qp1p3/3pP3/5NP1/PPPP1PBP/RNB1K2R w KQkq - 1 7';
  // La casilla capturada coincide con el destino de la jugada: es otra cosa.
  assert.equal(defensaAbandonada(antes, despues, 'd7', 'd7', 'b'), null);
});

test('defensaAbandonada no revienta con datos corruptos', () => {
  assert.equal(defensaAbandonada('no es un fen', 'tampoco', 'b7', 'd7', 'b'), null);
});
