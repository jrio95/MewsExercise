import type { EstadisticasGlobales } from '@shared';
import { ETIQUETA_FASE, claseNota, fechaCorta } from '../lib/formato';

interface Props {
  stats: EstadisticasGlobales | null;
  cargando: boolean;
}

/**
 * Vista agregada del historico: es la que responde a "que hago mal siempre".
 * Un patron solo es util si se repite, asi que todo se mide en numero de
 * partidas afectadas, no en incidencias sueltas.
 */
export function Progreso({ stats, cargando }: Props) {
  if (cargando) return <p className="aviso">Calculando…</p>;
  if (!stats || stats.partidas === 0) {
    return (
      <div className="tarjeta vacio">
        <h3>Aun no hay datos suficientes</h3>
        <p>Analiza algunas partidas y aqui apareceran tus errores recurrentes y tu evolucion.</p>
      </div>
    );
  }

  const maxVeces = Math.max(...stats.erroresFrecuentes.map((e) => e.veces), 1);

  return (
    <div className="progreso">
      <div className="tarjeta panel-cabecera">
        <div className={`precision ${claseNota(stats.precisionMedia)}`}>
          <span className="cifra">{stats.precisionMedia}%</span>
          <span className="pie">precision media</span>
        </div>
        <p className="total">
          sobre <strong>{stats.partidas}</strong>{' '}
          {stats.partidas === 1 ? 'partida analizada' : 'partidas analizadas'}
        </p>
      </div>

      {stats.puntosDebiles.length > 0 && (
        <div className="tarjeta">
          <h3>Tu plan de entrenamiento</h3>
          <ol className="consejos">
            {stats.puntosDebiles.map((c, i) => (
              <li key={i} className={`prioridad-${c.prioridad}`}>
                <strong>{c.titulo}</strong>
                <p>{c.detalle}</p>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="tarjeta">
        <h3>Errores mas repetidos</h3>
        <ul className="barras">
          {stats.erroresFrecuentes.slice(0, 10).map((e) => (
            <li key={e.etiqueta}>
              <div className="barra-fila">
                <span className="barra-nombre">{e.descripcion}</span>
                <span className="barra-valor">
                  {e.veces} · en {e.partidas}/{stats.partidas} partidas
                </span>
              </div>
              <div className="barra-pista">
                <div className="barra-relleno" style={{ width: `${(e.veces / maxVeces) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="tarjeta">
        <h3>Donde pierdes mas</h3>
        <ul className="fases grandes">
          {(['apertura', 'medio', 'final'] as const).map((f) => (
            <li key={f}>
              <span>{ETIQUETA_FASE[f]}</span>
              <span className="cp">
                {stats.perdidaPorFase[f].jugadas > 0
                  ? `${stats.perdidaPorFase[f].perdidaMedia} cp/jugada`
                  : 'sin datos'}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {stats.aperturas.length > 0 && (
        <div className="tarjeta">
          <h3>Tus aperturas</h3>
          <table className="tabla-aperturas">
            <thead>
              <tr>
                <th>Apertura</th>
                <th>Partidas</th>
                <th>V/E/D</th>
                <th>Precision</th>
              </tr>
            </thead>
            <tbody>
              {stats.aperturas.map((a) => (
                <tr key={`${a.eco}-${a.nombre}`}>
                  <td>
                    <span className="eco">{a.eco}</span> {a.nombre}
                  </td>
                  <td>{a.partidas}</td>
                  <td>
                    {a.victorias}/{a.tablas}/{a.derrotas}
                  </td>
                  <td className={claseNota(a.precisionMedia)}>{a.precisionMedia}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {stats.precisionPorPartida.length > 1 && (
        <div className="tarjeta">
          <h3>Evolucion</h3>
          <Evolucion datos={stats.precisionPorPartida} />
        </div>
      )}
    </div>
  );
}

/** Grafico de linea minimo en SVG: no merece la pena una libreria para esto. */
function Evolucion({ datos }: { datos: { id: string; creadoEn: string; precision: number }[] }) {
  const ancho = 640;
  const alto = 180;
  const margen = { arriba: 12, derecha: 12, abajo: 24, izquierda: 34 };
  const util = { w: ancho - margen.izquierda - margen.derecha, h: alto - margen.arriba - margen.abajo };

  const x = (i: number) => margen.izquierda + (datos.length === 1 ? util.w / 2 : (i / (datos.length - 1)) * util.w);
  const y = (v: number) => margen.arriba + util.h - (v / 100) * util.h;

  const linea = datos.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.precision).toFixed(1)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${ancho} ${alto}`} className="grafico" role="img" aria-label="Evolucion de la precision">
      {[0, 25, 50, 75, 100].map((v) => (
        <g key={v}>
          <line x1={margen.izquierda} x2={ancho - margen.derecha} y1={y(v)} y2={y(v)} className="rejilla" />
          <text x={margen.izquierda - 6} y={y(v) + 4} className="eje">
            {v}
          </text>
        </g>
      ))}
      <path d={linea} className="linea-grafico" />
      {datos.map((d, i) => (
        <circle key={d.id} cx={x(i)} cy={y(d.precision)} r={3.5} className="punto">
          <title>{`${fechaCorta(d.creadoEn)} — ${d.precision}%`}</title>
        </circle>
      ))}
    </svg>
  );
}
