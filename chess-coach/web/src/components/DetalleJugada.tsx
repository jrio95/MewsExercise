import type { JugadaAnalizada } from '@shared';
import { ETIQUETA_CALIDAD, ETIQUETA_FASE, formatearEval, nombreJugada } from '../lib/formato';

interface Props {
  jugada: JugadaAnalizada | null;
}

/** Ficha de la jugada seleccionada: que paso, cuanto costo y que era mejor. */
export function DetalleJugada({ jugada }: Props) {
  if (!jugada) {
    return (
      <div className="tarjeta detalle vacio">
        <p>Selecciona una jugada del listado o usa las flechas del teclado para recorrer la partida.</p>
      </div>
    );
  }

  return (
    <div className={`tarjeta detalle borde-${jugada.calidad}`}>
      <header>
        <h3>
          {nombreJugada(jugada.ply)} {jugada.san}
        </h3>
        <span className={`chip calidad-${jugada.calidad}`}>{ETIQUETA_CALIDAD[jugada.calidad]}</span>
      </header>

      <dl className="metricas">
        <div>
          <dt>Evaluacion</dt>
          <dd>
            {formatearEval(jugada.evalAntes)} → {formatearEval(jugada.evalDespues)}
          </dd>
        </div>
        <div>
          <dt>Perdida</dt>
          <dd>{jugada.perdidaCp} cp</dd>
        </div>
        <div>
          <dt>Precision</dt>
          <dd>{jugada.precision}%</dd>
        </div>
        <div>
          <dt>Fase</dt>
          <dd>{ETIQUETA_FASE[jugada.fase]}</dd>
        </div>
      </dl>

      {jugada.comentario ? (
        <p className="comentario">{jugada.comentario}</p>
      ) : (
        <p className="comentario bien">
          Nada que corregir aqui{jugada.mejorJugadaSan ? `: el motor jugaria ${jugada.mejorJugadaSan}` : ''}.
        </p>
      )}

      {jugada.mejorLineaSan.length > 0 && (
        <p className="linea">
          <span className="etiqueta">Continuacion del motor</span>
          <code>{jugada.mejorLineaSan.join(' ')}</code>
        </p>
      )}
    </div>
  );
}
