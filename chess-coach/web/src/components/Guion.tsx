import { forwardRef, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Calidad, Evaluacion, InformePartida, JugadaAnalizada } from '@shared';
import {
  COLOR_CALIDAD,
  ETIQUETA_CALIDAD,
  construirRecorrido,
  nombreCalidad,
  resaltarUltima,
  type Anotacion,
  type Recorrido,
} from '../lib/guion';
import { TableroPaso } from './TableroPaso';
import { barraEval, formatearEval } from '../lib/formato';

interface Props {
  informe: InformePartida;
  onSalir: () => void;
  onVerDetalle: () => void;
}

/** Separación entre tablero y texto, en píxeles (debe coincidir con el CSS). */
const HUECO = 14;
const LADO_MINIMO = 180;

/**
 * Calcula el lado del tablero a partir del hueco que deja el texto.
 *
 * Medir solo el contenedor del tablero no vale: como crece para ocupar el
 * espacio libre, el tablero acabaría centrado dentro de un hueco enorme y
 * quedaría un vacío entre la cabecera y las piezas. Midiendo el cuerpo entero y
 * restando lo que ocupa el texto, el tablero se lleva todo lo que sobra, que es
 * lo que interesa en un móvil: piezas lo más grandes posible.
 */
function useLadoTablero(
  cuerpo: React.RefObject<HTMLDivElement>,
  texto: React.RefObject<HTMLDivElement>,
  recalcular: unknown,
): number {
  const [lado, setLado] = useState(LADO_MINIMO);

  useLayoutEffect(() => {
    const cajaCuerpo = cuerpo.current;
    const cajaTexto = texto.current;
    if (!cajaCuerpo) return;

    const medir = () => {
      const { width, height } = cajaCuerpo.getBoundingClientRect();
      const altoTexto = cajaTexto?.getBoundingClientRect().height ?? 0;
      setLado(Math.max(LADO_MINIMO, Math.floor(Math.min(width, height - altoTexto - HUECO))));
    };

    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(cajaCuerpo);
    if (cajaTexto) observador.observe(cajaTexto);
    return () => observador.disconnect();
  }, [cuerpo, texto, recalcular]);

  return lado;
}

/**
 * Repaso guiado de la partida.
 *
 * El recorrido es una sola línea temporal: cada pulsación adelanta una jugada,
 * ni una más. Saltar de un consejo al siguiente movía el tablero varias jugadas
 * de golpe y se perdía el hilo de cómo se había llegado hasta ahí.
 */
export function Guion({ informe, onSalir, onVerDetalle }: Props) {
  const recorrido = useMemo(() => construirRecorrido(informe), [informe]);
  const ultimaParada = recorrido.fens.length - 1;

  // -1 es la portada y ultimaParada + 1 el cierre; en medio, una parada por jugada.
  const [parada, setParada] = useState(-1);

  const enPortada = parada === -1;
  const enCierre = parada > ultimaParada;
  const indiceTablero = Math.min(Math.max(parada, 0), ultimaParada);

  const anotacion = enPortada || enCierre ? undefined : recorrido.anotaciones.get(parada);
  const ultimaJugada = indiceTablero > 0 ? recorrido.jugadas[indiceTablero - 1] : undefined;
  const proximaJugada = recorrido.jugadas[indiceTablero];

  const avanzar = () => setParada((n) => Math.min(n + 1, ultimaParada + 1));
  const retroceder = () => setParada((n) => Math.max(n - 1, -1));
  const siguienteHito = recorrido.hitos.find((h) => h > parada);

  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') avanzar();
      if (e.key === 'ArrowLeft') retroceder();
      if (e.key === 'Escape') onSalir();
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  });

  // Deslizar con el dedo, más natural en el móvil que buscar el botón.
  const inicioX = useRef<number | null>(null);
  const alEmpezarToque = (e: React.TouchEvent) => {
    inicioX.current = e.touches[0]?.clientX ?? null;
  };
  const alTerminarToque = (e: React.TouchEvent) => {
    const inicio = inicioX.current;
    const fin = e.changedTouches[0]?.clientX;
    inicioX.current = null;
    if (inicio === null || fin === undefined || Math.abs(fin - inicio) < 60) return;
    if (fin < inicio) avanzar();
    else retroceder();
  };

  const cuerpo = useRef<HTMLDivElement>(null);
  const texto = useRef<HTMLDivElement>(null);
  const lado = useLadoTablero(cuerpo, texto, parada);

  const resaltadas = { ...resaltarUltima(ultimaJugada), ...(anotacion?.resaltadas ?? {}) };
  const progreso = ((parada + 1) / (ultimaParada + 2)) * 100;

  return (
    <div className="guion" onTouchStart={alEmpezarToque} onTouchEnd={alTerminarToque}>
      <header className="guion-cabecera">
        <button type="button" className="icono" onClick={onSalir} aria-label="Salir del repaso">
          ✕
        </button>
        <div
          className="guion-progreso"
          role="progressbar"
          aria-valuenow={parada + 1}
          aria-valuemin={0}
          aria-valuemax={ultimaParada + 1}
        >
          <div className="guion-progreso-relleno" style={{ width: `${progreso}%` }} />
          {/* Marcas de los momentos anotados: se ve de un vistazo qué queda por delante. */}
          {recorrido.hitos.map((h) => (
            <span key={h} className="guion-hito" style={{ left: `${((h + 1) / (ultimaParada + 2)) * 100}%` }} />
          ))}
        </div>
        <span className="guion-cuenta">
          {enPortada ? 'inicio' : enCierre ? 'fin' : `${indiceTablero}/${ultimaParada}`}
        </span>
      </header>

      <p className="guion-seccion">
        {enPortada
          ? 'Tu partida'
          : enCierre
            ? 'Para la próxima'
            : (anotacion?.seccion ?? cabeceraJugada(ultimaJugada))}
      </p>

      <div className="guion-cuerpo" ref={cuerpo}>
        <TableroPaso
          fen={recorrido.fens[indiceTablero]!}
          orientacion={recorrido.orientacion}
          flechas={anotacion?.flechas ?? []}
          resaltadas={resaltadas}
          lado={lado}
        />

        <Panel
          ref={texto}
          recorrido={recorrido}
          anotacion={anotacion}
          enPortada={enPortada}
          enCierre={enCierre}
          ultimaJugada={ultimaJugada}
          proximaJugada={proximaJugada}
        />
      </div>

      <nav className="guion-nav">
        <button type="button" className="secundario" onClick={retroceder} disabled={enPortada}>
          Atrás
        </button>

        {enCierre ? (
          <button type="button" className="primario" onClick={onVerDetalle}>
            Ver la partida entera
          </button>
        ) : (
          <button type="button" className="primario" onClick={avanzar}>
            {enPortada ? 'Empezar' : anotacion ? 'Entendido, sigue' : 'Siguiente jugada'}
          </button>
        )}
      </nav>

      {siguienteHito !== undefined && !enCierre && (
        <button type="button" className="guion-salto" onClick={() => setParada(siguienteHito)}>
          Saltar al siguiente aviso ⏭
        </button>
      )}
    </div>
  );
}

/** Rótulo de la jugada que se acaba de ver, para no perder la cuenta. */
function cabeceraJugada(ultima: JugadaAnalizada | undefined): string {
  if (!ultima) return 'Posición inicial';
  return `Jugada ${ultima.numeroJugada}${ultima.color === 'w' ? '' : '…'}`;
}

interface PanelProps {
  recorrido: Recorrido;
  anotacion: Anotacion | undefined;
  enPortada: boolean;
  enCierre: boolean;
  ultimaJugada: JugadaAnalizada | undefined;
  proximaJugada: JugadaAnalizada | undefined;
}

const Panel = forwardRef<HTMLDivElement, PanelProps>(function Panel(
  { recorrido, anotacion, enPortada, enCierre, ultimaJugada, proximaJugada },
  ref,
) {
  if (enPortada) {
    const { titulo, texto, insignia, desglose } = recorrido.resumen;
    return (
      <div className="guion-texto" ref={ref}>
        <div className="guion-titulo-fila">
          <h2>{titulo}</h2>
          <span className={`chip tono-${insignia.tono}`}>{insignia.texto}</span>
        </div>
        <Desglose desglose={desglose} />
        <p>{texto}</p>
      </div>
    );
  }

  if (enCierre) {
    return (
      <div className="guion-texto" ref={ref}>
        <div className="guion-titulo-fila">
          <h2>{recorrido.cierre.titulo}</h2>
        </div>
        <ul className="lista-cierre">
          {recorrido.cierre.puntos.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </div>
    );
  }

  if (anotacion) {
    return (
      <div className="guion-texto" ref={ref}>
        <div className="guion-titulo-fila">
          <h2>{anotacion.titulo}</h2>
          {anotacion.insignia && (
            <span className={`chip tono-${anotacion.insignia.tono}`}>{anotacion.insignia.texto}</span>
          )}
        </div>
        {anotacion.leyendas.length > 0 && <Leyendas leyendas={anotacion.leyendas} />}
        {anotacion.evolucion && <Oscilacion evolucion={anotacion.evolucion} />}
        <p>{anotacion.texto}</p>
        {anotacion.linea && anotacion.linea.length > 1 && (
          <p className="guion-linea">
            <span className="etiqueta">Seguiría</span>
            <code>{anotacion.linea.join(' ')}</code>
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="guion-texto guion-texto-simple" ref={ref}>
      <PasoNormal ultima={ultimaJugada} proxima={proximaJugada} />
    </div>
  );
});

/**
 * Lo que se ve en una jugada sin nada que comentar.
 *
 * No es relleno: dice qué se acaba de jugar, si estuvo bien y a quién le toca,
 * que es lo que hace falta para seguir la partida sin perderse.
 */
function PasoNormal({
  ultima,
  proxima,
}: {
  ultima: JugadaAnalizada | undefined;
  proxima: JugadaAnalizada | undefined;
}) {
  if (!ultima) {
    return (
      <>
        <h2>Empezamos</h2>
        <p>Cada vez que pulses avanzamos una jugada. Te aviso cuando haya algo que mirar.</p>
      </>
    );
  }

  const turno = proxima
    ? `Le toca a las ${proxima.color === 'w' ? 'blancas' : 'negras'}.`
    : 'Fin de la partida.';

  return (
    <>
      <div className="guion-titulo-fila">
        <h2>
          {ultima.numeroJugada}
          {ultima.color === 'w' ? '.' : '…'} {ultima.san}
        </h2>
        <span className="chip" style={{ color: COLOR_CALIDAD[ultima.calidad] }}>
          {ETIQUETA_CALIDAD[ultima.calidad]}
        </span>
      </div>
      <div className="oscilacion">
        <BarraHorizontal ev={ultima.evalDespues} etiqueta="ventaja" />
      </div>
      <p>{turno}</p>
    </>
  );
}

function Leyendas({ leyendas }: { leyendas: Anotacion['leyendas'] }) {
  return (
    <ul className="leyendas">
      {leyendas.map((l) => (
        <li key={l.texto}>
          <span className="punto" style={{ backgroundColor: l.color }} />
          {l.texto}
        </li>
      ))}
    </ul>
  );
}

function Oscilacion({ evolucion }: { evolucion: NonNullable<Anotacion['evolucion']> }) {
  return (
    <div className="oscilacion">
      <BarraHorizontal ev={evolucion.antes} etiqueta="ahora" />
      <span className="flecha-eval">→</span>
      <BarraHorizontal ev={evolucion.despues} etiqueta="después" />
    </div>
  );
}

/**
 * Reparto de tus jugadas por calidad, como una sola barra: de un vistazo se ve
 * cuánto de la partida jugaste bien, sin leer números.
 */
function Desglose({ desglose }: { desglose: { calidad: Calidad; veces: number }[] }) {
  const total = desglose.reduce((suma, d) => suma + d.veces, 0);
  if (total === 0) return null;

  return (
    <div className="desglose">
      <div className="desglose-barra">
        {desglose.map((d) => (
          <span
            key={d.calidad}
            style={{ width: `${(d.veces / total) * 100}%`, backgroundColor: COLOR_CALIDAD[d.calidad] }}
            title={`${d.veces} ${nombreCalidad(d.calidad, d.veces)}`}
          />
        ))}
      </div>
      <ul className="desglose-leyenda">
        {desglose.map((d) => (
          <li key={d.calidad}>
            <span className="punto" style={{ backgroundColor: COLOR_CALIDAD[d.calidad] }} />
            <strong>{d.veces}</strong> {nombreCalidad(d.calidad, d.veces)}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Barra de ventaja: quién está mejor de un vistazo, sin leer números. */
function BarraHorizontal({ ev, etiqueta }: { ev: Evaluacion; etiqueta: string }) {
  return (
    <div className="mini-eval">
      <span className="mini-eval-etiqueta">{etiqueta}</span>
      <div className="mini-eval-pista">
        <div className="mini-eval-blancas" style={{ width: `${barraEval(ev) * 100}%` }} />
      </div>
      <span className="mini-eval-valor">{formatearEval(ev)}</span>
    </div>
  );
}
