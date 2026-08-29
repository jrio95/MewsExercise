import { test } from 'node:test';
import assert from 'node:assert/strict';
import { construirDatos, sinDefensa } from '../src/coach/explicar.js';
import type { InformePartida, JugadaAnalizada } from '../src/types.js';

const INICIAL = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

test('sinDefensa no marca piezas defendidas en la posicion inicial', () => {
  // Solo las torres de esquina quedan sin defensa al inicio.
  const sueltas = sinDefensa(INICIAL, 'w');
  assert.match(sueltas, /Ra1/);
  assert.match(sueltas, /Rh1/);
  assert.ok(!sueltas.includes('Nb1'), 'el caballo de b1 lo defiende la torre');
  assert.ok(!sueltas.includes('Pe2'), 'el peon de e2 lo defienden dama y rey');
});

test('sinDefensa detecta una pieza realmente colgada', () => {
  // Con el peon en g3 y no en g2, nadie defiende al alfil de h3: es justo la
  // posicion que hace de 10.Bh3 un error grave.
  const colgado = 'r4rk1/ppp1bppp/2n2n2/4p3/4P1b1/5NPB/PPPB1P1P/R2QR1K1 b - - 1 10';
  assert.match(sinDefensa(colgado, 'w'), /Bh3/);

  // Con el peon en g2 el mismo alfil esta defendido y no debe aparecer.
  const defendido = 'rnbqkbnr/pppppppp/8/8/8/7B/PPPPPPPP/RNBQK1NR b KQkq - 0 1';
  assert.ok(!sinDefensa(defendido, 'w').includes('Bh3'), 'el peon de g2 lo defiende');
});

test('sinDefensa no revienta con un FEN corrupto', () => {
  assert.equal(sinDefensa('esto no es un fen', 'w'), 'no calculable');
});

const jugada: JugadaAnalizada = {
  ply: 19,
  numeroJugada: 10,
  color: 'w',
  san: 'Bh3',
  uci: 'g2h3',
  fenAntes: 'r4rk1/ppp1bppp/2n2n2/4p3/4P1b1/5NP1/PPPB1P1P/R2QR1K1 w - - 0 10',
  fenDespues: 'r4rk1/ppp1bppp/2n2n2/4p3/4P1b1/5NPB/PPPB1P1P/R2QR1K1 b - - 1 10',
  evalAntes: { cp: 600, mate: null },
  evalDespues: { cp: 210, mate: null },
  perdidaCp: 390,
  perdidaWin: 21.4,
  precision: 38,
  calidad: 'grave',
  fase: 'medio',
  mejorJugadaSan: 'Be3',
  mejorJugadaUci: 'd2e3',
  mejorLineaSan: ['Be3', 'Nxe4', 'h3'],
  etiquetas: ['pieza_colgada', 'error_medio'],
  comentario: '10. Bh3 es un error grave.',
};

const informe = {
  id: 'x',
  creadoEn: '',
  nivel: 'rapido',
  profundidad: 14,
  cabeceras: {},
  blancas: 'jrio95',
  negras: 'Rival',
  resultado: '0-1',
  colorJugador: 'w',
  apertura: { eco: 'A00', nombre: 'Hungarian Opening', plyLibro: 1, primeraFueraDeLibro: 'e5', consejo: '' },
  jugadas: [jugada],
  resumen: {} as InformePartida['resumen'],
  consejos: [],
  narrativa: null,
  pgn: '',
} as unknown as InformePartida;

test('los datos enviados al modelo contienen los hechos del motor, no opiniones', () => {
  const datos = construirDatos(informe, jugada);

  // Sin la posicion no puede razonar sobre piezas concretas.
  assert.ok(datos.includes(jugada.fenAntes), 'falta el FEN previo');
  assert.match(datos, /JUGADA REALIZADA: Bh3/);
  assert.match(datos, /JUGADA RECOMENDADA POR EL MOTOR: Be3/);
  assert.match(datos, /Be3 Nxe4 h3/, 'falta la linea principal');
  assert.match(datos, /pieza_colgada/);
  assert.match(datos, /Mueven las blancas/);
  assert.match(datos, /Fase: medio/);

  // Las evaluaciones se dan en peones, que es como se habla de ellas.
  assert.match(datos, /6\.00/);
  assert.match(datos, /2\.10/);
  assert.match(datos, /390 centipeones/);
});

test('los datos distinguen las piezas sueltas antes y despues de mover', () => {
  const datos = construirDatos(informe, jugada);
  const [antes, despues] = datos.split('JUGADA REALIZADA');
  assert.ok(antes && despues);
  assert.match(antes, /sin defensa antes de mover/);
  assert.match(despues, /sin defensa despues de mover/);
  // El alfil que se va a h3 queda suelto: es justo la razon del error.
  assert.match(despues, /Bh3/);
});

test('un mate se expresa como mate, no como centipeones', () => {
  const conMate: JugadaAnalizada = {
    ...jugada,
    evalDespues: { cp: null, mate: -2 },
  };
  const datos = construirDatos(informe, conMate);
  assert.match(datos, /mate en 2 para las negras/);
});
