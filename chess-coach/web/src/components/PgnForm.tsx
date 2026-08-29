import { useState } from 'react';
import type { PeticionAnalisis } from '../lib/api';

const EJEMPLO = `[Event "Paris Opera"]
[White "Morphy, Paul"]
[Black "Duke Karl / Count Isouard"]
[Result "1-0"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7
8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7
14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0`;

interface Props {
  onAnalizar: (datos: PeticionAnalisis) => void;
  cargando: boolean;
  coachIa: boolean;
}

export function PgnForm({ onAnalizar, cargando, coachIa }: Props) {
  const [pgn, setPgn] = useState('');
  const [nivel, setNivel] = useState<PeticionAnalisis['nivel']>('normal');
  const [colorJugador, setColor] = useState<PeticionAnalisis['colorJugador']>('auto');
  const [nombreJugador, setNombre] = useState('');
  const [narrar, setNarrar] = useState(false);

  return (
    <form
      className="tarjeta formulario"
      onSubmit={(e) => {
        e.preventDefault();
        if (pgn.trim()) onAnalizar({ pgn, nivel, colorJugador, nombreJugador, narrar });
      }}
    >
      <label htmlFor="pgn">
        <span className="etiqueta">PGN de tu partida</span>
        <textarea
          id="pgn"
          value={pgn}
          onChange={(e) => setPgn(e.target.value)}
          placeholder="Pega aqui el PGN. En Lichess: Analisis &gt; FEN &amp; PGN. En Chess.com: Repasar &gt; Descargar."
          rows={11}
          spellCheck={false}
          required
        />
      </label>

      <div className="fila-controles">
        <label>
          <span className="etiqueta">Analizas como</span>
          <select value={colorJugador} onChange={(e) => setColor(e.target.value as never)}>
            <option value="auto">Detectar por nombre</option>
            <option value="w">Blancas</option>
            <option value="b">Negras</option>
          </select>
        </label>

        <label>
          <span className="etiqueta">Tu nombre en el PGN</span>
          <input
            type="text"
            value={nombreJugador}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="p. ej. jrio95"
            disabled={colorJugador !== 'auto'}
          />
        </label>

        <label>
          <span className="etiqueta">Profundidad</span>
          <select value={nivel} onChange={(e) => setNivel(e.target.value as never)}>
            <option value="rapido">Rapida (unos segundos)</option>
            <option value="normal">Normal (recomendada)</option>
            <option value="profundo">Profunda (mas lenta)</option>
          </select>
        </label>
      </div>

      {coachIa && (
        <label className="casilla">
          <input type="checkbox" checked={narrar} onChange={(e) => setNarrar(e.target.checked)} />
          <span>Anadir comentario narrado por IA sobre el analisis del motor</span>
        </label>
      )}

      <div className="acciones">
        <button type="submit" className="primario" disabled={cargando || !pgn.trim()}>
          {cargando ? 'Analizando…' : 'Analizar partida'}
        </button>
        <button type="button" className="secundario" onClick={() => setPgn(EJEMPLO)} disabled={cargando}>
          Probar con un ejemplo
        </button>
      </div>
    </form>
  );
}
