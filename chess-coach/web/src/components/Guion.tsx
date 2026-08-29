import { forwardRef, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { InformePartida } from '@shared';
import { COLOR_CALIDAD, construirGuion, nombreCalidad, type Paso } from '../lib/guion';
import { TableroPaso } from './TableroPaso';
import { formatearEval, barraEval } from '../lib/formato';

interface Props {
  informe: InformePartida;
  onSalir: () => void;
  onVerDetalle: () => void;
}

/** Separacion entre tablero y texto, en pixeles (debe coincidir con el CSS). */
const HUECO = 14;
const LADO_MINIMO = 180;

/**
 * Calcula el lado del tablero a partir del hueco que deja el texto.
 *
 * Medir solo el contenedor del tablero no vale: como crece para ocupar el
 * espacio libre, el tablero acabaria centrado dentro de un hueco enorme y
 * quedaria un vacio entre la cabecera y las piezas. Midiendo el cuerpo entero y
 * restando lo que ocupa el texto, el tablero se lleva todo lo que sobra, que es
 * lo que interesa en un movil: piezas lo mas grandes posible.
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
 * Recorrido guiado: una pantalla completa por idea, con el tablero delante y
 * un único botón para avanzar. Está pensado para el móvil, donde una página
 * larga con todo el informe obliga a desplazarse sin saber qué mirar.
 */
export function Guion({ informe, onSalir, onVerDetalle }: Props) {
  const pasos = useMemo(() => construirGuion(informe), [informe]);
  const [i, setI] = useState(0);
  const paso = pasos[i] ?? pasos[0]!;
  const ultimo = i === pasos.length - 1;

  const cuerpo = useRef<HTMLDivElement>(null);
  const texto = useRef<HTMLDivElement>(null);
  const lado = useLadoTablero(cuerpo, texto, paso.id);

  const avanzar = () => setI((n) => Math.min(n + 1, pasos.length - 1));
  const retroceder = () => setI((n) => Math.max(n - 1, 0));

  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') avanzar();
      if (e.key === 'ArrowLeft') retroceder();
      if (e.key === 'Escape') onSalir();
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  });

  // Deslizar con el dedo, que en el móvil es más natural que buscar el botón.
  const inicioX = useRef<number | null>(null);
  const alEmpezarToque = (e: React.TouchEvent) => {
    inicioX.current = e.touches[0]?.clientX ?? null;
  };
  const alTerminarToque = (e: React.TouchEvent) => {
    const inicio = inicioX.current;
    const fin = e.changedTouches[0]?.clientX;
    inicioX.current = null;
    if (inicio === null || fin === undefined) return;
    const recorrido = fin - inicio;
    if (Math.abs(recorrido) < 60) return;
    if (recorrido < 0) avanzar();
    else retroceder();
  };

  return (
    <div className="guion" onTouchStart={alEmpezarToque} onTouchEnd={alTerminarToque}>
      <header className="guion-cabecera">
        <button type="button" className="icono" onClick={onSalir} aria-label="Salir del repaso">
          ✕
        </button>
        <div className="guion-progreso" role="progressbar" aria-valuenow={i + 1} aria-valuemin={1} aria-valuemax={pasos.length}>
          <div className="guion-progreso-relleno" style={{ width: `${((i + 1) / pasos.length) * 100}%` }} />
        </div>
        <span className="guion-cuenta">
          {i + 1}/{pasos.length}
        </span>
      </header>

      <p className="guion-seccion">{paso.seccion}</p>

      <div className="guion-cuerpo" ref={cuerpo}>
        <TableroPaso paso={paso} lado={lado} />
        <Explicacion paso={paso} ref={texto} />
      </div>

      <nav className="guion-nav">
        <button type="button" className="secundario" onClick={retroceder} disabled={i === 0}>
          Atrás
        </button>
        {ultimo ? (
          <button type="button" className="primario" onClick={onVerDetalle}>
            Ver la partida entera
          </button>
        ) : (
          <button type="button" className="primario" onClick={avanzar}>
            Siguiente
          </button>
        )}
      </nav>
    </div>
  );
}

/** Bloque de texto de cada paso: corto, y siempre debajo del tablero. */
const Explicacion = forwardRef<HTMLDivElement, { paso: Paso }>(function Explicacion({ paso }, ref) {
  return (
    <div className="guion-texto" ref={ref}>
      <div className="guion-titulo-fila">
        <h2>{paso.titulo}</h2>
        {paso.insignia && <span className={`chip tono-${paso.insignia.tono}`}>{paso.insignia.texto}</span>}
      </div>

      {paso.leyendas.length > 0 && (
        <ul className="leyendas">
          {paso.leyendas.map((l) => (
            <li key={l.texto}>
              <span className="punto" style={{ backgroundColor: l.color }} />
              {l.texto}
            </li>
          ))}
        </ul>
      )}

      {paso.desglose && <Desglose desglose={paso.desglose} />}

      {paso.evolucion && (
        <div className="oscilacion">
          <BarraHorizontal ev={paso.evolucion.antes} etiqueta="antes" />
          <span className="flecha-eval">→</span>
          <BarraHorizontal ev={paso.evolucion.despues} etiqueta="después" />
        </div>
      )}

      {paso.tipo === 'cierre' ? (
        <ul className="lista-cierre">
          {paso.texto.split('\n').map((linea) => (
            <li key={linea}>{linea}</li>
          ))}
        </ul>
      ) : (
        <p>{paso.texto}</p>
      )}

      {paso.linea && paso.linea.length > 1 && (
        <p className="guion-linea">
          <span className="etiqueta">Seguiría</span>
          <code>{paso.linea.join(' ')}</code>
        </p>
      )}
    </div>
  );
});

/**
 * Reparto de tus jugadas por calidad, como una sola barra.
 *
 * De un vistazo se ve cuanto de la partida jugaste bien, sin leer numeros:
 * es la respuesta grafica a "que tal lo hice".
 */
function Desglose({ desglose }: { desglose: NonNullable<Paso['desglose']> }) {
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
function BarraHorizontal({ ev, etiqueta }: { ev: import('@shared').Evaluacion; etiqueta: string }) {
  const blancas = barraEval(ev) * 100;
  return (
    <div className="mini-eval">
      <span className="mini-eval-etiqueta">{etiqueta}</span>
      <div className="mini-eval-pista">
        <div className="mini-eval-blancas" style={{ width: `${blancas}%` }} />
      </div>
      <span className="mini-eval-valor">{formatearEval(ev)}</span>
    </div>
  );
}
