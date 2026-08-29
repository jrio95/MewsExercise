import { useMemo } from 'react';
import { Chessboard } from 'react-chessboard';
import type { Arrow, Square } from 'react-chessboard/dist/chessboard/types';
import type { Color, JugadaAnalizada } from '@shared';
import { barraEval, formatearEval } from '../lib/formato';

interface Props {
  jugada: JugadaAnalizada | null;
  orientacion: Color;
  /** Mostrar la flecha de la jugada que recomendaba el motor. */
  mostrarMejor: boolean;
}

const POSICION_INICIAL = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/**
 * Tablero con dos flechas: en rojo la jugada que se hizo, en verde la que
 * recomendaba el motor. Ver las dos juntas es lo que hace que se entienda el
 * error sin tener que leer nada.
 */
export function Tablero({ jugada, orientacion, mostrarMejor }: Props) {
  const flechas = useMemo(() => {
    if (!jugada) return [];
    const lista: Arrow[] = [[jugada.uci.slice(0, 2) as Square, jugada.uci.slice(2, 4) as Square, '#e0653f']];

    const mejor = jugada.mejorJugadaUci;
    if (mostrarMejor && mejor && jugada.calidad !== 'mejor') {
      lista.push([mejor.slice(0, 2) as Square, mejor.slice(2, 4) as Square, '#3fa66b']);
    }
    return lista;
  }, [jugada, mostrarMejor]);

  const ev = jugada?.evalDespues ?? { cp: 20, mate: null };
  const alturaBlancas = barraEval(ev) * 100;

  return (
    <div className="zona-tablero">
      <div className="barra-eval" title={`Evaluacion: ${formatearEval(ev)}`}>
        <div className="barra-negras" />
        <div className="barra-blancas" style={{ height: `${alturaBlancas}%` }} />
        <span className={`barra-texto ${alturaBlancas > 50 ? 'abajo' : 'arriba'}`}>{formatearEval(ev)}</span>
      </div>

      <div className="marco-tablero">
        <Chessboard
          position={jugada?.fenDespues ?? POSICION_INICIAL}
          boardOrientation={orientacion === 'w' ? 'white' : 'black'}
          arePiecesDraggable={false}
          customArrows={flechas}
          customBoardStyle={{ borderRadius: '10px' }}
          customDarkSquareStyle={{ backgroundColor: '#6b8f6b' }}
          customLightSquareStyle={{ backgroundColor: '#e9edd8' }}
        />
      </div>
    </div>
  );
}
