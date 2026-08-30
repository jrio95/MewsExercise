import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChessComError, describirPgn, traerPartidas } from '../src/importar/chesscom.js';

/** PGN con la forma real que sirve Chess.com: relojes, Elo y enlace. */
const PGN_CHESSCOM = `[Event "Live Chess"]
[Site "Chess.com"]
[Date "2026.08.28"]
[White "Rival99"]
[Black "jrio95"]
[Result "0-1"]
[WhiteElo "1480"]
[BlackElo "1512"]
[TimeControl "300+3"]
[UTCDate "2026.08.28"]
[Link "https://www.chess.com/game/live/123456789"]

1. e4 {[%clk 0:05:00]} e5 {[%clk 0:04:57]} 2. Nf3 {[%clk 0:04:55]} Nc6 {[%clk 0:04:52]} 0-1`;

test('describirPgn saca los datos del PGN, no del JSON de Chess.com', () => {
  const p = describirPgn(PGN_CHESSCOM, 'jrio95');
  assert.ok(p);
  assert.equal(p.blancas, 'Rival99');
  assert.equal(p.negras, 'jrio95');
  assert.equal(p.resultado, '0-1');
  assert.equal(p.tuColor, 'b', 'el usuario jugaba con negras');
  assert.equal(p.rival, 'Rival99');
  assert.equal(p.eloRival, '1480', 'el Elo del rival es el de las blancas');
  assert.equal(p.controlTiempo, '300+3');
  assert.equal(p.fuenteId, 'https://www.chess.com/game/live/123456789');
});

test('el nombre de usuario se compara sin distinguir mayusculas', () => {
  assert.equal(describirPgn(PGN_CHESSCOM, 'JRio95')?.tuColor, 'b');
  assert.equal(describirPgn(PGN_CHESSCOM, 'RIVAL99')?.tuColor, 'w');
});

test('si el usuario no juega la partida, no se le asigna color', () => {
  const p = describirPgn(PGN_CHESSCOM, 'otrapersona');
  assert.ok(p);
  assert.equal(p.tuColor, null);
  assert.match(p.rival, /Rival99 vs jrio95/);
});

test('sin enlace, el identificador se deriva del propio PGN y es estable', () => {
  const sinEnlace = PGN_CHESSCOM.replace(/\[Link[^\]]*\]\n/, '');
  const a = describirPgn(sinEnlace, 'jrio95');
  const b = describirPgn(sinEnlace, 'jrio95');
  assert.ok(a && b);
  assert.equal(a.fuenteId, b.fuenteId, 'la misma partida da siempre el mismo id');
  assert.match(a.fuenteId, /^pgn:/);

  // Una partida distinta no puede compartir identificador.
  const otra = describirPgn(sinEnlace.replace('Rival99', 'OtroRival'), 'jrio95');
  assert.notEqual(a.fuenteId, otra?.fuenteId);
});

test('un PGN sin jugadas o ilegible se descarta', () => {
  assert.equal(describirPgn('[White "a"]\n[Black "b"]\n\n*', 'a'), null);
  assert.equal(describirPgn('esto no es ajedrez', 'a'), null);
});

/* --------------------------------------------------------------- */
/* Llamadas a la API, con respuestas simuladas                       */
/* --------------------------------------------------------------- */

function simularFetch(respuestas: Record<string, { estado?: number; cuerpo?: unknown }>) {
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL) => {
    const clave = String(url);
    const r = respuestas[clave];
    if (!r) throw new Error(`peticion inesperada a ${clave}`);
    return {
      ok: (r.estado ?? 200) < 400,
      status: r.estado ?? 200,
      json: async () => r.cuerpo,
    } as Response;
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

const ARCHIVOS = 'https://api.chess.com/pub/player/jrio95/games/archives';

test('trae las partidas mas recientes primero y respeta el limite', async () => {
  const restaurar = simularFetch({
    [ARCHIVOS]: {
      cuerpo: {
        archives: [
          'https://api.chess.com/pub/player/jrio95/games/2026/07',
          'https://api.chess.com/pub/player/jrio95/games/2026/08',
        ],
      },
    },
    'https://api.chess.com/pub/player/jrio95/games/2026/08': {
      cuerpo: {
        games: [
          { pgn: PGN_CHESSCOM.replace('Rival99', 'Antigua') },
          { pgn: PGN_CHESSCOM.replace('Rival99', 'Reciente') },
        ],
      },
    },
  });

  try {
    const partidas = await traerPartidas('jrio95', 1);
    assert.equal(partidas.length, 1, 'debe parar al llegar al limite');
    assert.equal(partidas[0]!.blancas, 'Reciente', 'la ultima del mes va primero');
  } finally {
    restaurar();
  }
});

test('las partidas sin PGN se saltan sin romper la importacion', async () => {
  const restaurar = simularFetch({
    [ARCHIVOS]: { cuerpo: { archives: ['https://api.chess.com/pub/player/jrio95/games/2026/08'] } },
    'https://api.chess.com/pub/player/jrio95/games/2026/08': {
      cuerpo: { games: [{ url: 'x' }, { pgn: PGN_CHESSCOM }, { pgn: 'ilegible' }] },
    },
  });

  try {
    const partidas = await traerPartidas('jrio95', 10);
    assert.equal(partidas.length, 1);
  } finally {
    restaurar();
  }
});

test('un usuario sin partidas devuelve una lista vacia', async () => {
  const restaurar = simularFetch({ [ARCHIVOS]: { cuerpo: { archives: [] } } });
  try {
    assert.deepEqual(await traerPartidas('jrio95', 10), []);
  } finally {
    restaurar();
  }
});

test('un usuario inexistente da un error explicativo, no un fallo tecnico', async () => {
  const restaurar = simularFetch({ [ARCHIVOS]: { estado: 404 } });
  try {
    await assert.rejects(
      () => traerPartidas('jrio95', 10),
      (err: ChessComError) => {
        assert.equal(err.estado, 404);
        assert.match(err.message, /no existe/i);
        return true;
      },
    );
  } finally {
    restaurar();
  }
});

test('el limite de peticiones de Chess.com se traduce a un aviso claro', async () => {
  const restaurar = simularFetch({ [ARCHIVOS]: { estado: 429 } });
  try {
    await assert.rejects(
      () => traerPartidas('jrio95', 10),
      (err: ChessComError) => err.estado === 429 && /Espera/i.test(err.message),
    );
  } finally {
    restaurar();
  }
});

test('se rechaza un usuario con formato imposible antes de llamar a la red', async () => {
  const restaurar = simularFetch({});
  try {
    await assert.rejects(() => traerPartidas('a', 10), ChessComError);
    await assert.rejects(() => traerPartidas('con espacio', 10), ChessComError);
    await assert.rejects(() => traerPartidas('../../etc/passwd', 10), ChessComError);
  } finally {
    restaurar();
  }
});

test('si Chess.com cambia el formato, falla de forma detectable', async () => {
  const restaurar = simularFetch({ [ARCHIVOS]: { cuerpo: { otraCosa: [] } } });
  try {
    // Un cambio de esquema debe lanzar, no devolver una lista vacia en silencio.
    await assert.rejects(() => traerPartidas('jrio95', 10));
  } finally {
    restaurar();
  }
});
