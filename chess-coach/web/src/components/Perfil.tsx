import { useEffect, useState } from 'react';
import type { Color, Confianza, Hallazgo, PerfilColor, PerfilJugador } from '@shared';
import { api } from '../lib/api';
import { claseNota, fechaCorta } from '../lib/formato';

const NOMBRE_COLOR: Record<Color, string> = { w: 'Blancas', b: 'Negras' };
const NOMBRE_FASE = { apertura: 'Apertura', medio: 'Medio juego', final: 'Final' } as const;

const TEXTO_CONFIANZA: Record<Confianza, string> = {
  baja: 'pocos datos',
  media: 'dato razonable',
  alta: 'dato solido',
};

interface Props {
  perfil: PerfilJugador | null;
  cargando: boolean;
  /** El servidor tiene clave de IA: se puede pedir el informe del entrenador. */
  coachIa: boolean;
}

/**
 * Perfil del jugador a partir de todo su historico.
 *
 * Se organiza en fuertes / a corregir / repertorio y no como una lista plana de
 * cifras: lo util no es el numero, es la conclusion, y por eso cada una lleva
 * el dato que la sostiene y cuanta confianza merece.
 */
export function Perfil({ perfil, cargando, coachIa }: Props) {
  if (cargando) return <p className="aviso">Calculando tu perfil…</p>;
  if (!perfil) return <p className="aviso">No se ha podido cargar el perfil.</p>;

  if (perfil.partidas === 0) {
    return (
      <div className="tarjeta vacio">
        <h3>Todavia no hay perfil</h3>
        <p>Analiza algunas partidas y aqui apareceran tus puntos fuertes, lo que repites y tu repertorio.</p>
      </div>
    );
  }

  return (
    <div className="perfil">
      <Cabecera perfil={perfil} />

      {perfil.fuertes.length > 0 && (
        <section className="tarjeta">
          <h3>Lo que haces bien</h3>
          <ul className="hallazgos">
            {perfil.fuertes.map((h) => (
              <Tarjeta key={h.id} hallazgo={h} tono="bien" />
            ))}
          </ul>
        </section>
      )}

      {perfil.debiles.length > 0 && (
        <section className="tarjeta">
          <h3>Lo que repites</h3>
          <ul className="hallazgos">
            {perfil.debiles.map((h) => (
              <Tarjeta key={h.id} hallazgo={h} tono="mal" />
            ))}
          </ul>
        </section>
      )}

      <section className="tarjeta">
        <h3>Tu repertorio</h3>
        <div className="repertorio">
          {(['w', 'b'] as Color[]).map((c) => (
            <BloqueColor key={c} datos={perfil.porColor[c]} />
          ))}
        </div>
      </section>

      {perfil.precisionPorPartida.length > 1 && (
        <section className="tarjeta">
          <h3>Evolucion</h3>
          <Evolucion datos={perfil.precisionPorPartida} />
        </section>
      )}

      {coachIa && <InformeEntrenador guardado={perfil.informeIa} partidas={perfil.partidas} />}

      {perfil.plan.length > 0 && (
        <section className="tarjeta">
          <h3>Por donde empezar</h3>
          <ol className="consejos">
            {perfil.plan.map((c, i) => (
              <li key={i} className={`prioridad-${c.prioridad}`}>
                <strong>{c.titulo}</strong>
                <p>{c.detalle}</p>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function Cabecera({ perfil }: { perfil: PerfilJugador }) {
  const castigo = perfil.castigo
    ? Math.round((perfil.castigo.aprovechadas / perfil.castigo.ocasiones) * 100)
    : null;

  return (
    <section className="tarjeta perfil-cabecera">
      <div className={`precision ${claseNota(perfil.precisionMedia)}`}>
        <span className="cifra">{perfil.precisionMedia}%</span>
        <span className="pie">precision media</span>
      </div>

      <ul className="perfil-cifras">
        <li>
          <span className="valor">{perfil.partidas}</span>
          <span className="nombre">{perfil.partidas === 1 ? 'partida' : 'partidas'}</span>
        </li>
        <li>
          <span className="valor">{perfil.aciertoMejor}%</span>
          <span className="nombre">jugadas que son la mejor</span>
        </li>
        {castigo !== null && (
          <li>
            <span className="valor">{castigo}%</span>
            <span className="nombre">fallos del rival aprovechados</span>
          </li>
        )}
        <li>
          <span className="valor">
            {perfil.solidez.sinGraves}/{perfil.solidez.partidas}
          </span>
          <span className="nombre">partidas sin error grave</span>
        </li>
      </ul>

      {perfil.tendencia && <Tendencia tendencia={perfil.tendencia} />}
    </section>
  );
}

function Tendencia({ tendencia }: { tendencia: NonNullable<PerfilJugador['tendencia']> }) {
  const salto = Math.round((tendencia.ahora - tendencia.antes) * 10) / 10;
  const tono = salto >= 1 ? 'bien' : salto <= -1 ? 'mal' : 'neutro';
  const texto =
    salto >= 1 ? `has subido ${salto} puntos` : salto <= -1 ? `has bajado ${Math.abs(salto)} puntos` : 'te mantienes';

  return (
    <p className={`perfil-tendencia tono-${tono}`}>
      De tus primeras partidas a las ultimas, {texto} ({tendencia.antes}% → {tendencia.ahora}%).
    </p>
  );
}

function Tarjeta({ hallazgo, tono }: { hallazgo: Hallazgo; tono: 'bien' | 'mal' }) {
  return (
    <li className={`hallazgo ${tono}`}>
      <div className="hallazgo-cabecera">
        <strong>{hallazgo.titulo}</strong>
        <span className={`confianza ${hallazgo.confianza}`} title="Fiabilidad segun el numero de datos">
          {TEXTO_CONFIANZA[hallazgo.confianza]}
        </span>
      </div>
      <p>{hallazgo.detalle}</p>
      <p className="hallazgo-evidencia">{hallazgo.evidencia}</p>
    </li>
  );
}

function BloqueColor({ datos }: { datos: PerfilColor }) {
  if (datos.partidas === 0) {
    return (
      <div className="color-bloque vacio-bloque">
        <h4>
          <span className={`bolita ${datos.color === 'w' ? 'blancas' : 'negras'}`} />
          {NOMBRE_COLOR[datos.color]}
        </h4>
        <p className="hallazgo-evidencia">Sin partidas analizadas con este color.</p>
      </div>
    );
  }

  return (
    <div className="color-bloque">
      <h4>
        <span className={`bolita ${datos.color === 'w' ? 'blancas' : 'negras'}`} />
        {NOMBRE_COLOR[datos.color]}
        <span className="color-resumen">
          {datos.partidas} · {datos.precisionMedia}% · {Math.round(datos.rendimiento * 100)} pts
        </span>
      </h4>

      <ul className="fases">
        {(['apertura', 'medio', 'final'] as const).map((f) => (
          <li key={f}>
            <span>{NOMBRE_FASE[f]}</span>
            <span className="cp">
              {datos.perdidaPorFase[f].jugadas > 0
                ? `${datos.perdidaPorFase[f].perdidaMedia} cp/jugada`
                : 'sin datos'}
            </span>
          </li>
        ))}
      </ul>

      {datos.aperturas.length > 0 ? (
        <table className="tabla-aperturas">
          <thead>
            <tr>
              <th>Apertura</th>
              <th>Part.</th>
              <th>V/E/D</th>
              <th>Precision</th>
            </tr>
          </thead>
          <tbody>
            {datos.aperturas.slice(0, 6).map((a) => (
              <tr key={a.eco}>
                <td>
                  <span className="eco">{a.eco}</span> {a.nombre}
                </td>
                <td>{a.partidas}</td>
                <td>
                  {a.victorias}/{a.tablas}/{a.derrotas}
                </td>
                <td className={a.desviacion >= 3 ? 'nota-alta' : a.desviacion <= -3 ? 'nota-baja' : ''}>
                  {a.precisionMedia}%
                  {a.partidas >= 3 && Math.abs(a.desviacion) >= 3 && (
                    <span className="desviacion">
                      {a.desviacion > 0 ? '+' : ''}
                      {a.desviacion}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="hallazgo-evidencia">Ninguna de tus aperturas con este color esta en el libro.</p>
      )}
    </div>
  );
}


/** Grafico de linea minimo en SVG: no merece la pena una libreria para esto. */
function Evolucion({ datos }: { datos: PerfilJugador['precisionPorPartida'] }) {
  const ancho = 640;
  const alto = 180;
  const margen = { arriba: 12, derecha: 12, abajo: 24, izquierda: 34 };
  const util = { w: ancho - margen.izquierda - margen.derecha, h: alto - margen.arriba - margen.abajo };

  const x = (i: number) =>
    margen.izquierda + (datos.length === 1 ? util.w / 2 : (i / (datos.length - 1)) * util.w);
  const y = (v: number) => margen.arriba + util.h - (v / 100) * util.h;
  const linea = datos
    .map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.precision).toFixed(1)}`)
    .join(' ');

  return (
    <svg viewBox={`0 0 ${ancho} ${alto}`} className="grafico" role="img" aria-label="Evolucion de tu precision">
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

/**
 * Informe redactado por el modelo sobre el perfil completo.
 *
 * Es el unico sitio de la aplicacion donde se le permite recomendar aperturas
 * que el jugador no ha jugado nunca: eso no esta en sus datos y es justo lo que
 * aporta un entrenador. Se le exige distinguir cuando una recomendacion sale de
 * su criterio y no de las partidas.
 */
function InformeEntrenador({
  guardado,
  partidas,
}: {
  guardado: string | null;
  partidas: number;
}) {
  const [texto, setTexto] = useState<string | null>(guardado);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTexto(guardado);
    setError(null);
  }, [guardado, partidas]);

  const pedir = async () => {
    setCargando(true);
    setError(null);
    try {
      const r = await api.informePerfil();
      setTexto(r.informe);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar el informe.');
    } finally {
      setCargando(false);
    }
  };

  return (
    <section className="tarjeta">
      <h3>Informe del entrenador</h3>

      {texto ? (
        <>
          <div className="informe-ia">
            {texto.split('\n').filter(Boolean).map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
          <p className="hallazgo-evidencia">
            Escrito por Claude sobre los datos de arriba. Las aperturas que recomiende y no aparezcan
            en tus partidas son sugerencia suya, no una conclusion de tu historico.
          </p>
        </>
      ) : (
        <>
          <p className="informe-intro">
            Un repaso escrito de todo tu perfil, con que entrenar y en que orden. Es el unico sitio
            donde puede recomendarte aperturas que todavia no juegas.
          </p>
          <button type="button" className="boton-porque" onClick={pedir} disabled={cargando}>
            {cargando ? 'Escribiendo…' : `Pedir informe sobre mis ${partidas} partidas`}
          </button>
          {error && <p className="por-que-error">{error}</p>}
        </>
      )}
    </section>
  );
}
