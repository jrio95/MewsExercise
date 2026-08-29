import { useCallback, useEffect, useState } from 'react';
import type { Color, InformePartida, EstadisticasGlobales, PartidaResumida } from '@shared';
import { api, type PeticionAnalisis } from './lib/api';
import { PgnForm } from './components/PgnForm';
import { Tablero } from './components/Tablero';
import { ListaJugadas } from './components/ListaJugadas';
import { DetalleJugada } from './components/DetalleJugada';
import { Resumen } from './components/Resumen';
import { Historico } from './components/Historico';
import { Progreso } from './components/Progreso';

type Pestana = 'analizar' | 'historico' | 'progreso';

export default function App() {
  const [pestana, setPestana] = useState<Pestana>('analizar');
  const [informe, setInforme] = useState<InformePartida | null>(null);
  const [indice, setIndice] = useState(-1);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coachIa, setCoachIa] = useState(false);
  const [soloMisJugadas, setSoloMisJugadas] = useState(true);

  const [partidas, setPartidas] = useState<PartidaResumida[]>([]);
  const [stats, setStats] = useState<EstadisticasGlobales | null>(null);
  const [cargandoHistorico, setCargandoHistorico] = useState(false);

  useEffect(() => {
    api.salud().then((s) => setCoachIa(s.coachIa)).catch(() => setCoachIa(false));
  }, []);

  const refrescarHistorico = useCallback(async () => {
    setCargandoHistorico(true);
    try {
      const [p, s] = await Promise.all([api.partidas(), api.estadisticas()]);
      setPartidas(p);
      setStats(s);
    } catch {
      // El historico es secundario: si falla, la pantalla de analisis sigue viva.
    } finally {
      setCargandoHistorico(false);
    }
  }, []);

  useEffect(() => {
    void refrescarHistorico();
  }, [refrescarHistorico]);

  const analizar = async (datos: PeticionAnalisis) => {
    setCargando(true);
    setError(null);
    try {
      const r = await api.analizar(datos);
      setInforme(r);
      setIndice(primerFalloDe(r));
      void refrescarHistorico();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo analizar la partida.');
    } finally {
      setCargando(false);
    }
  };

  const abrirPartida = async (id: string) => {
    setError(null);
    try {
      const r = await api.partida(id);
      setInforme(r);
      setIndice(primerFalloDe(r));
      setPestana('analizar');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo abrir la partida.');
    }
  };

  const borrarPartida = async (id: string) => {
    await api.borrar(id).catch(() => undefined);
    if (informe?.id === id) setInforme(null);
    void refrescarHistorico();
  };

  // Navegacion por teclado: recorrer la partida con las flechas es lo que hace
  // usable un analisis largo.
  useEffect(() => {
    if (!informe) return;
    const alPulsar = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /input|textarea|select/i.test(e.target.tagName)) return;
      if (e.key === 'ArrowRight') setIndice((i) => Math.min(i + 1, informe.jugadas.length - 1));
      if (e.key === 'ArrowLeft') setIndice((i) => Math.max(i - 1, -1));
      if (e.key === 'Home') setIndice(-1);
      if (e.key === 'End') setIndice(informe.jugadas.length - 1);
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [informe]);

  const jugadaActual = informe && indice >= 0 ? (informe.jugadas[indice] ?? null) : null;
  const orientacion: Color = informe?.colorJugador ?? 'w';

  return (
    <div className="app">
      <header className="cabecera">
        <div className="marca">
          <span className="logo">♞</span>
          <div>
            <h1>Chess Coach</h1>
            <p>Pega el PGN de tu partida y descubre que fallaste, que era mejor y que repites.</p>
          </div>
        </div>
        <nav className="pestanas">
          {(
            [
              ['analizar', 'Analizar'],
              ['historico', `Historico${partidas.length ? ` (${partidas.length})` : ''}`],
              ['progreso', 'Progreso'],
            ] as const
          ).map(([id, texto]) => (
            <button
              key={id}
              type="button"
              className={pestana === id ? 'activa' : ''}
              onClick={() => setPestana(id)}
            >
              {texto}
            </button>
          ))}
        </nav>
      </header>

      <main>
        {error && <div className="alerta">{error}</div>}

        {pestana === 'analizar' && (
          <>
            <PgnForm onAnalizar={analizar} cargando={cargando} coachIa={coachIa} />

            {cargando && (
              <div className="tarjeta cargando">
                <div className="spinner" />
                <p>Stockfish esta evaluando cada posicion de la partida…</p>
              </div>
            )}

            {informe && !cargando && (
              <>
                <Resumen informe={informe} />

                <section className="analisis">
                  <Tablero jugada={jugadaActual} orientacion={orientacion} mostrarMejor />

                  <div className="columna-jugadas">
                    <div className="controles-jugadas">
                      <button type="button" onClick={() => setIndice(-1)} title="Posicion inicial">
                        ⏮
                      </button>
                      <button type="button" onClick={() => setIndice((i) => Math.max(i - 1, -1))}>
                        ◀
                      </button>
                      <button
                        type="button"
                        onClick={() => setIndice((i) => Math.min(i + 1, informe.jugadas.length - 1))}
                      >
                        ▶
                      </button>
                      <button type="button" onClick={() => setIndice(informe.jugadas.length - 1)}>
                        ⏭
                      </button>
                      <label className="casilla compacta">
                        <input
                          type="checkbox"
                          checked={soloMisJugadas}
                          onChange={(e) => setSoloMisJugadas(e.target.checked)}
                        />
                        <span>Destacar solo mis jugadas</span>
                      </label>
                    </div>

                    <ListaJugadas
                      jugadas={informe.jugadas}
                      indiceActivo={indice}
                      onSeleccionar={setIndice}
                      filtroColor={soloMisJugadas ? informe.colorJugador : null}
                    />

                    <DetalleJugada jugada={jugadaActual} />
                  </div>
                </section>
              </>
            )}
          </>
        )}

        {pestana === 'historico' && (
          <Historico
            partidas={partidas}
            onAbrir={abrirPartida}
            onBorrar={borrarPartida}
            cargando={cargandoHistorico}
          />
        )}

        {pestana === 'progreso' && <Progreso stats={stats} cargando={cargandoHistorico} />}
      </main>

      <footer>
        <p>
          Analisis con Stockfish 16. Tu historico se guarda en el servidor asociado a un identificador
          anonimo de este navegador.
        </p>
      </footer>
    </div>
  );
}

/**
 * Al abrir un informe saltamos directamente al momento que le interesa al
 * jugador, no a la primera jugada de la apertura: su primer error serio y, si
 * no cometio ninguno, la jugada que mas le costo.
 */
function primerFalloDe(informe: InformePartida): number {
  const mias = informe.jugadas.filter((j) => j.color === informe.colorJugador);
  if (mias.length === 0) return 0;

  const fallo = mias.find((j) => j.calidad === 'grave' || j.calidad === 'error');
  if (fallo) return informe.jugadas.indexOf(fallo);

  const peor = mias.reduce((a, b) => (b.perdidaWin > a.perdidaWin ? b : a));
  return peor.perdidaWin > 0 ? informe.jugadas.indexOf(peor) : 0;
}
