import type { PartidaResumida } from '@shared';
import { claseNota, fechaCorta } from '../lib/formato';

interface Props {
  partidas: PartidaResumida[];
  onAbrir: (id: string) => void;
  onBorrar: (id: string) => void;
  cargando: boolean;
}

/** Historico de partidas guardadas en este navegador. */
export function Historico({ partidas, onAbrir, onBorrar, cargando }: Props) {
  if (cargando) return <p className="aviso">Cargando historico…</p>;

  if (partidas.length === 0) {
    return (
      <div className="tarjeta vacio">
        <h3>Todavia no has guardado ninguna partida</h3>
        <p>
          Cada partida que analices se guarda aqui automaticamente. Con tres o cuatro ya empiezan a
          verse patrones en la pestana <strong>Progreso</strong>.
        </p>
      </div>
    );
  }

  return (
    <div className="tarjeta tabla-historico">
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Partida</th>
            <th>Apertura</th>
            <th>Precision</th>
            <th>Fallos</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {partidas.map((p) => (
            <tr key={p.id}>
              <td className="fecha">{fechaCorta(p.creadoEn)}</td>
              <td>
                <button type="button" className="enlace" onClick={() => onAbrir(p.id)}>
                  {p.blancas} vs {p.negras}
                </button>
                <span className="meta">
                  {p.colorJugador === 'w' ? 'blancas' : 'negras'} · {p.resultado}
                </span>
              </td>
              <td className="apertura">
                {p.eco && <span className="eco">{p.eco}</span>} {p.apertura ?? '—'}
              </td>
              <td className={`precision-celda ${claseNota(p.precision)}`}>{p.precision}%</td>
              <td className="fallos">
                <span className="calidad-grave" title="Errores graves">
                  {p.graves}
                </span>
                <span className="calidad-error" title="Errores">
                  {p.errores}
                </span>
                <span className="calidad-imprecision" title="Imprecisiones">
                  {p.imprecisiones}
                </span>
              </td>
              <td>
                <button
                  type="button"
                  className="borrar"
                  onClick={() => onBorrar(p.id)}
                  aria-label="Borrar partida"
                  title="Borrar partida"
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
