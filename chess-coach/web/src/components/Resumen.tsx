import type { Calidad, InformePartida } from '@shared';
import { ETIQUETA_CALIDAD, ETIQUETA_FASE, claseNota } from '../lib/formato';

const ORDEN: Calidad[] = ['mejor', 'excelente', 'buena', 'imprecision', 'error', 'grave'];

interface Props {
  informe: InformePartida;
}

/** Cabecera del informe: precision, recuento de errores, apertura y consejos. */
export function Resumen({ informe }: Props) {
  const resumen = informe.resumen[informe.colorJugador];
  const rival = informe.resumen[informe.colorJugador === 'w' ? 'b' : 'w'];
  const yo = informe.colorJugador === 'w' ? informe.blancas : informe.negras;
  const el = informe.colorJugador === 'w' ? informe.negras : informe.blancas;

  return (
    <section className="resumen">
      <div className="tarjeta panel-precision">
        <div className={`precision ${claseNota(resumen.precision)}`}>
          <span className="cifra">{resumen.precision}%</span>
          <span className="pie">tu precision</span>
        </div>
        <div className="comparativa">
          <p>
            <strong>{yo}</strong> ({informe.colorJugador === 'w' ? 'blancas' : 'negras'}) · {resumen.precision}%
          </p>
          <p className="rival">
            {el} · {rival.precision}%
          </p>
          <p className="resultado">Resultado: {informe.resultado}</p>
        </div>
      </div>

      <div className="tarjeta panel-conteo">
        <h3>Tus jugadas</h3>
        <ul className="conteo">
          {ORDEN.map((c) => (
            <li key={c} className={`calidad-${c}`}>
              <span className="valor">{resumen.conteo[c]}</span>
              <span className="nombre">{ETIQUETA_CALIDAD[c]}</span>
            </li>
          ))}
        </ul>
        <h4>Perdida media por fase</h4>
        <ul className="fases">
          {(['apertura', 'medio', 'final'] as const).map((f) => (
            <li key={f}>
              <span>{ETIQUETA_FASE[f]}</span>
              <span className="cp">
                {resumen.perdidaPorFase[f].jugadas > 0
                  ? `${resumen.perdidaPorFase[f].perdidaMedia} cp`
                  : '—'}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {informe.apertura && (
        <div className="tarjeta panel-apertura">
          <h3>Apertura</h3>
          <p className="nombre-apertura">
            <span className="eco">{informe.apertura.eco}</span> {informe.apertura.nombre}
          </p>
          <p className="consejo-apertura">{informe.apertura.consejo}</p>
          {informe.apertura.primeraFueraDeLibro && (
            <p className="fuera-libro">
              Primera jugada fuera de teoria: <code>{informe.apertura.primeraFueraDeLibro}</code>
            </p>
          )}
        </div>
      )}

      <div className="tarjeta panel-consejos">
        <h3>Que corregir</h3>
        <ol className="consejos">
          {informe.consejos.map((c, i) => (
            <li key={i} className={`prioridad-${c.prioridad}`}>
              <strong>{c.titulo}</strong>
              <p>{c.detalle}</p>
            </li>
          ))}
        </ol>
      </div>

      {informe.narrativa && (
        <div className="tarjeta panel-narrativa">
          <h3>Comentario del entrenador</h3>
          {informe.narrativa.split('\n').filter(Boolean).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      )}
    </section>
  );
}
