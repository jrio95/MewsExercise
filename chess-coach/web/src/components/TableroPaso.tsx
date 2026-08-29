import { Chessboard } from 'react-chessboard';
import type { Arrow, Square } from 'react-chessboard/dist/chessboard/types';
import type { Paso } from '../lib/guion';

interface Props {
  paso: Paso;
  /** Lado en píxeles, calculado por el contenedor según el hueco libre. */
  lado: number;
}

export function TableroPaso({ paso, lado }: Props) {
  const flechas: Arrow[] = paso.flechas.map((f) => [f.desde as Square, f.hasta as Square, f.color]);

  return (
    <div className="hueco-tablero">
      <div style={{ width: lado, height: lado }}>
        <Chessboard
          position={paso.fen}
          boardWidth={lado}
          boardOrientation={paso.orientacion === 'w' ? 'white' : 'black'}
          arePiecesDraggable={false}
          customArrows={flechas}
          customSquareStyles={paso.resaltadas}
          customBoardStyle={{ borderRadius: '10px' }}
          customDarkSquareStyle={{ backgroundColor: '#6b8f6b' }}
          customLightSquareStyle={{ backgroundColor: '#e9edd8' }}
        />
      </div>
    </div>
  );
}
