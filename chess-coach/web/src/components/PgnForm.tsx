import { useEffect, useMemo, useState } from 'react';
import type { Color } from '@shared';
import type { PeticionAnalisis } from '../lib/api';

const EJEMPLO = `[Event "Paris Opera"]
[White "Morphy, Paul"]
[Black "Duke Karl / Count Isouard"]
[Result "1-0"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7
8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7
14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0`;

/** Último nombre con el que el usuario dijo estar jugando. */
const CLAVE_NOMBRE = 'chess-coach:jugador';

interface Props {
  onAnalizar: (datos: PeticionAnalisis) => void;
  cargando: boolean;
  coachIa: boolean;
}

/**
 * Lee los nombres de las cabeceras sin llegar a interpretar la partida.
 *
 * Una expresión regular basta y, a diferencia del parseo completo, funciona
 * mientras el usuario todavía está pegando el texto.
 */
function jugadoresDe(pgn: string): { blancas: string | null; negras: string | null } {
  const nombre = (etiqueta: string) => {
    const encontrado = new RegExp(`\\[${etiqueta}\\s+"([^"]*)"\\]`, 'i').exec(pgn)?.[1]?.trim();
    return encontrado && encontrado !== '?' ? encontrado : null;
  };
  return { blancas: nombre('White'), negras: nombre('Black') };
}

export function PgnForm({ onAnalizar, cargando, coachIa }: Props) {
  const [pgn, setPgn] = useState('');
  const [nivel, setNivel] = useState<PeticionAnalisis['nivel']>('normal');
  const [color, setColor] = useState<Color | null>(null);
  const [narrar, setNarrar] = useState(false);

  const jugadores = useMemo(() => jugadoresDe(pgn), [pgn]);

  /**
   * Preselección a partir del nombre con el que jugó la última vez.
   *
   * Antes había un "detectar por nombre" que, con el campo vacío, elegía
   * blancas sin decir nada: si el usuario jugaba con negras veía la partida del
   * revés y con las jugadas del rival comentadas como suyas. Ahora el color es
   * una elección explícita, y solo se adelanta cuando hay una coincidencia real.
   */
  useEffect(() => {
    const recordado = localStorage.getItem(CLAVE_NOMBRE)?.toLowerCase();
    if (!recordado) return;
    if (jugadores.blancas?.toLowerCase().includes(recordado)) setColor('w');
    else if (jugadores.negras?.toLowerCase().includes(recordado)) setColor('b');
  }, [jugadores.blancas, jugadores.negras]);

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pgn.trim() || color === null) return;

    const nombre = color === 'w' ? jugadores.blancas : jugadores.negras;
    if (nombre) localStorage.setItem(CLAVE_NOMBRE, nombre);

    onAnalizar({ pgn, nivel, colorJugador: color, nombreJugador: nombre ?? undefined, narrar });
  };

  return (
    <form className="tarjeta formulario" onSubmit={enviar}>
      <label htmlFor="pgn">
        <span className="etiqueta">PGN de tu partida</span>
        <textarea
          id="pgn"
          value={pgn}
          onChange={(e) => setPgn(e.target.value)}
          placeholder="Pega aqui el PGN. En Lichess: Analisis &gt; FEN &amp; PGN. En Chess.com: Repasar &gt; Descargar."
          rows={9}
          spellCheck={false}
          required
        />
      </label>

      <fieldset className="bandos">
        <legend className="etiqueta">¿Con qué color jugabas tú?</legend>
        <div className="bandos-opciones">
          <button
            type="button"
            className={`bando ${color === 'w' ? 'elegido' : ''}`}
            onClick={() => setColor('w')}
            aria-pressed={color === 'w'}
          >
            <span className="bando-pieza blancas">♔</span>
            <span className="bando-nombre">{jugadores.blancas ?? 'Blancas'}</span>
            {jugadores.blancas && <span className="bando-lado">blancas</span>}
          </button>

          <button
            type="button"
            className={`bando ${color === 'b' ? 'elegido' : ''}`}
            onClick={() => setColor('b')}
            aria-pressed={color === 'b'}
          >
            <span className="bando-pieza negras">♔</span>
            <span className="bando-nombre">{jugadores.negras ?? 'Negras'}</span>
            {jugadores.negras && <span className="bando-lado">negras</span>}
          </button>
        </div>
        <p className="bandos-pie">
          El tablero y todos los comentarios se ponen desde ese lado.
        </p>
      </fieldset>

      <label>
        <span className="etiqueta">Profundidad</span>
        <select value={nivel} onChange={(e) => setNivel(e.target.value as never)}>
          <option value="rapido">Rapida (unos segundos)</option>
          <option value="normal">Normal (recomendada)</option>
          <option value="profundo">Profunda (mas lenta)</option>
        </select>
      </label>

      {coachIa && (
        <label className="casilla">
          <input type="checkbox" checked={narrar} onChange={(e) => setNarrar(e.target.checked)} />
          <span>Anadir comentario narrado por IA sobre el analisis del motor</span>
        </label>
      )}

      <div className="acciones">
        <button type="submit" className="primario" disabled={cargando || !pgn.trim() || color === null}>
          {cargando ? 'Analizando…' : color === null ? 'Elige tu color' : 'Analizar partida'}
        </button>
        <button type="button" className="secundario" onClick={() => setPgn(EJEMPLO)} disabled={cargando}>
          Probar con un ejemplo
        </button>
      </div>
    </form>
  );
}
