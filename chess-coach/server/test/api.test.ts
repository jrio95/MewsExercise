import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// La base se resuelve al importar los modulos, asi que hay que fijar DATA_DIR antes.
const dir = mkdtempSync(join(tmpdir(), 'chess-coach-test-'));
process.env.DATA_DIR = dir;

const { guardarPartida, listarPartidas, obtenerPartida, borrarPartida, calcularEstadisticas, yaImportadas } =
  await import('../src/db/games.js');
const { analizarPartida, PgnInvalidoError } = await import('../src/analysis/analyzeGame.js');
const { pool } = await import('../src/engine/pool.js');
const { cerrarDb } = await import('../src/db/index.js');

const PGN_OPERA = `[White "Morphy"]
[Black "Duke"]
[Result "1-0"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7
8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7
14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0`;

const PGN_CORTO = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *';

let motorDisponible = true;

before(async () => {
  motorDisponible = await pool.healthy();
});

after(() => {
  pool.shutdown();
  cerrarDb();
  rmSync(dir, { recursive: true, force: true });
});

test('rechaza un PGN que no contiene una partida legal', async () => {
  await assert.rejects(
    () => analizarPartida({ pgn: 'esto no es ajedrez', nivel: 'rapido' }),
    PgnInvalidoError,
  );
});

test('analiza una partida completa y produce un informe coherente', async (t) => {
  if (!motorDisponible) return t.skip('stockfish no disponible en este entorno');

  const informe = await analizarPartida({ pgn: PGN_OPERA, nivel: 'rapido', colorJugador: 'b' });

  assert.equal(informe.jugadas.length, 33);
  assert.equal(informe.colorJugador, 'b');
  assert.equal(informe.resultado, '1-0');
  assert.equal(informe.apertura?.eco, 'C41');

  // Morphy jugo una partida modelo: su precision debe salir muy alta.
  assert.ok(informe.resumen.w.precision > 90, `precision de Morphy: ${informe.resumen.w.precision}`);
  assert.ok(informe.resumen.b.precision < informe.resumen.w.precision);

  // La jugada de mate no puede puntuar como error.
  const mate = informe.jugadas.at(-1)!;
  assert.equal(mate.san, 'Rd8#');
  assert.equal(mate.perdidaWin, 0);
  assert.equal(mate.precision, 100);

  // Toda jugada debe traer los datos que consume la interfaz.
  for (const j of informe.jugadas) {
    assert.ok(j.precision >= 0 && j.precision <= 100, `precision fuera de rango en ${j.san}`);
    assert.ok(j.perdidaCp >= 0 && j.perdidaCp <= 1000, `perdida fuera de rango en ${j.san}`);
    assert.match(j.uci, /^[a-h][1-8][a-h][1-8][qrbn]?$/);
  }

  assert.ok(informe.consejos.length > 0);
  assert.ok(informe.consejos.every((c) => c.titulo && c.detalle));
});

test('las jugadas que coinciden con el motor no pierden nada', async (t) => {
  if (!motorDisponible) return t.skip('stockfish no disponible en este entorno');

  const informe = await analizarPartida({ pgn: PGN_CORTO, nivel: 'rapido' });
  for (const j of informe.jugadas.filter((x) => x.calidad === 'mejor')) {
    assert.equal(j.perdidaCp, 0, `${j.san} es la jugada del motor pero registra perdida`);
    assert.equal(j.precision, 100);
  }
});

test('guarda, recupera y borra una partida sin mezclar usuarios', async (t) => {
  if (!motorDisponible) return t.skip('stockfish no disponible en este entorno');

  const informe = await analizarPartida({ pgn: PGN_OPERA, nivel: 'rapido', colorJugador: 'b' });
  guardarPartida('ana', informe);

  const deAna = listarPartidas('ana');
  assert.equal(deAna.length, 1);
  assert.equal(deAna[0]!.id, informe.id);
  assert.equal(deAna[0]!.eco, 'C41');

  assert.deepEqual(listarPartidas('luis'), [], 'el historico no debe cruzarse entre usuarios');
  assert.equal(obtenerPartida('luis', informe.id), null);

  const recuperado = obtenerPartida('ana', informe.id);
  assert.ok(recuperado);
  assert.equal(recuperado.jugadas.length, informe.jugadas.length);

  assert.equal(borrarPartida('luis', informe.id), false);
  assert.equal(borrarPartida('ana', informe.id), true);
  assert.deepEqual(listarPartidas('ana'), []);
});

test('las estadisticas agregan etiquetas y aperturas del historico', async (t) => {
  if (!motorDisponible) return t.skip('stockfish no disponible en este entorno');

  const informe = await analizarPartida({ pgn: PGN_OPERA, nivel: 'rapido', colorJugador: 'b' });
  guardarPartida('bea', { ...informe, id: 'partida-1' });
  guardarPartida('bea', { ...informe, id: 'partida-2' });

  const stats = calcularEstadisticas('bea');
  assert.equal(stats.partidas, 2);
  assert.ok(stats.precisionMedia > 0);
  assert.ok(stats.erroresFrecuentes.length > 0);
  assert.ok(stats.erroresFrecuentes.every((e) => e.descripcion.length > 0));
  assert.equal(stats.aperturas[0]?.eco, 'C41');
  assert.equal(stats.aperturas[0]?.partidas, 2);

  // Un patron presente en las dos partidas debe aparecer como punto debil.
  assert.ok(stats.puntosDebiles.some((c) => c.prioridad === 1));
});

test('un usuario sin partidas devuelve estadisticas vacias, no un error', () => {
  const stats = calcularEstadisticas('nadie');
  assert.equal(stats.partidas, 0);
  assert.deepEqual(stats.erroresFrecuentes, []);
  assert.deepEqual(stats.aperturas, []);
  assert.equal(stats.perdidaPorFase.apertura.jugadas, 0);
});

test('cambiar de bando rehace consejos y agregados sin volver a analizar', async (t) => {
  if (!motorDisponible) return t.skip('stockfish no disponible en este entorno');

  const { cambiarColor } = await import('../src/db/games.js');

  // Se guarda con el color equivocado, que es justo lo que pasaba cuando el
  // formulario elegia blancas por defecto.
  const informe = await analizarPartida({ pgn: PGN_OPERA, nivel: 'rapido', colorJugador: 'w' });
  guardarPartida('cris', informe);

  const listadoAntes = listarPartidas('cris');
  assert.equal(listadoAntes[0]!.colorJugador, 'w');
  assert.equal(listadoAntes[0]!.precision, informe.resumen.w.precision);

  const corregido = cambiarColor('cris', informe.id, 'b');
  assert.ok(corregido);
  assert.equal(corregido.colorJugador, 'b');
  assert.equal(corregido.jugadas.length, informe.jugadas.length, 'el analisis no se rehace');

  const listadoDespues = listarPartidas('cris');
  assert.equal(listadoDespues.length, 1, 'no se duplica la partida');
  assert.equal(listadoDespues[0]!.colorJugador, 'b');
  assert.equal(listadoDespues[0]!.precision, informe.resumen.b.precision);
  assert.equal(listadoDespues[0]!.graves, informe.resumen.b.conteo.grave);

  // Las etiquetas agregadas deben ser las del nuevo bando, no una mezcla.
  const stats = calcularEstadisticas('cris');
  const etiquetas = new Set(stats.erroresFrecuentes.map((e) => e.etiqueta));
  for (const propia of Object.keys(informe.resumen.b.etiquetas)) {
    assert.ok(etiquetas.has(propia as never), `falta la etiqueta ${propia} del bando corregido`);
  }
  for (const ajena of Object.keys(informe.resumen.w.etiquetas)) {
    if (ajena in informe.resumen.b.etiquetas) continue;
    assert.ok(!etiquetas.has(ajena as never), `quedo colgada la etiqueta ${ajena} del bando anterior`);
  }

  assert.equal(cambiarColor('cris', 'no-existe', 'w'), null);
});


test('una partida importada dos veces se actualiza, no se duplica', async (t) => {
  if (!motorDisponible) return t.skip('stockfish no disponible en este entorno');

  const origen = { fuente: 'chesscom', fuenteId: 'https://www.chess.com/game/live/42' };
  const informe = await analizarPartida({ pgn: PGN_CORTO, nivel: 'rapido', colorJugador: 'w' });

  guardarPartida('dani', informe, origen);
  assert.equal(yaImportadas('dani', [origen.fuenteId]).get(origen.fuenteId), informe.id);
  assert.equal(listarPartidas('dani').length, 1);

  // Reanalizar la misma partida (por ejemplo a mas profundidad) la reemplaza.
  const masProfundo = await analizarPartida({ pgn: PGN_CORTO, nivel: 'rapido', colorJugador: 'b' });
  guardarPartida('dani', masProfundo, origen);

  const historico = listarPartidas('dani');
  assert.equal(historico.length, 1, 'el indice unico impide dos filas para la misma partida');
  assert.equal(historico[0]!.id, masProfundo.id, 'queda la version mas reciente');
  assert.equal(historico[0]!.colorJugador, 'b');

  // Y las etiquetas del analisis anterior no quedan colgadas.
  const stats = calcularEstadisticas('dani');
  assert.equal(stats.partidas, 1);
});

test('las partidas pegadas a mano no chocan entre si aunque no tengan origen', async (t) => {
  if (!motorDisponible) return t.skip('stockfish no disponible en este entorno');

  const a = await analizarPartida({ pgn: PGN_CORTO, nivel: 'rapido', colorJugador: 'w' });
  const b = await analizarPartida({ pgn: PGN_OPERA, nivel: 'rapido', colorJugador: 'w' });

  // Sin fuente_id el indice unico no aplica: dos partidas conviven.
  guardarPartida('eva', a);
  guardarPartida('eva', b);
  assert.equal(listarPartidas('eva').length, 2);
});
