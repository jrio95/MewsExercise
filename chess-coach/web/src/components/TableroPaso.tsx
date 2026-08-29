import { Chessboard } from 'react-chessboard';
import type { Arrow, Square } from 'react-chessboard/dist/chessboard/types';
import type { Color } from '@shared';
import type { Flecha, Resaltadas } from '../lib/guion';

interface Props {
  fen: string;
  orientacion: Color;
  flechas: Flecha[];
  resaltadas: Resaltadas;
  /** Lado en píxeles, calculado por el contenedor según el hueco libre. */
  lado: number;
}

export function TableroPaso({ fen, orientacion, flechas, resaltadas, lado }: Props) {
  const dibujadas: Arrow[] = flechas.map((f) => [f.desde as Square, f.hasta as Square, f.color]);

  return (
    <div className="hueco-tablero">
      <div style={{ width: lado, height: lado }}>
        <Chessboard
          position={fen}
          boardWidth={lado}
          boardOrientation={orientacion === 'w' ? 'white' : 'black'}
          arePiecesDraggable={false}
          customArrows={dibujadas}
          customSquareStyles={resaltadas}
          // Al avanzar de una en una, la animación deja ver qué pieza se movió.
          animationDuration={220}
          customBoardStyle={{ borderRadius: '10px' }}
          customDarkSquareStyle={{ backgroundColor: '#6b8f6b' }}
          customLightSquareStyle={{ backgroundColor: '#e9edd8' }}
        />
      </div>
    </div>
  );
}
