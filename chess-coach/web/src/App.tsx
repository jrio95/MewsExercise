import { useCallback, useEffect, useState } from 'react';
import type { Color, InformePartida, PartidaResumida, PerfilJugador } from '@shared';
import { api, type PartidaChesscom, type PeticionAnalisis } from './lib/api';
import { PgnForm } from './components/PgnForm';
import { Tablero } from './components/Tablero';
import { ListaJugadas } from './components/ListaJugadas';
import { DetalleJugada } from './components/DetalleJugada';
import { Resumen } from './components/Resumen';
import { Historico } from './components/Historico';
import { Perfil } from './components/Perfil';
import { ImportarChesscom } from './components/ImportarChesscom';
import { Guion } from './components/Guion';

type Pestana = 'analizar' | 'historico' | 'perfil';

/**
 * 'guion' es el repaso guiado paso a paso, pantalla a pantalla: es el modo por
 * defecto porque es el que funciona en el movil. 'detalle' es el informe
 * completo de siempre, para quien quiera recorrer la partida jugada a jugada.
 */
type Modo = 'guion' | 'detalle';

export default function App() {
  const [pestana, setPestana] = useState<Pestana>('analizar');
  const [informe, setInforme] = useState<InformePartida | null>(null);
  const [indice, setIndice] = useState(-1);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coachIa, setCoachIa] = useState(false);
  const [motor, setMotor] = useState<string | null>(null);
  const [soloMisJugadas, setSoloMisJugadas] = useState(true);
  const [modo, setModo] = useState<Modo>('guion');

  const [partidas, setPartidas] = useState<PartidaResumida[]>([]);
  const [perfil, setPerfil] = useState<PerfilJugador | null>(null);
  const [cargandoHistorico, setCargandoHistorico] = useState(false);

  useEffect(() => {
    api
      .salud()
      .then((s) => {
        setCoachIa(s.coachIa);
        setMotor(s.motor);
      })
      .catch(() => setCoachIa(false));
  }, []);

  const refrescarHistorico = useCallback(async () => {
    setCargandoHistorico(true);
    try {
      const [p, perf] = await Promise.all([api.partidas(), api.perfil()]);
      setPartidas(p);
      setPerfil(perf);
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
      setModo('guion');
      void refrescarHistorico();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo analizar la partida.');
    } finally {
      setCargando(false);
    }
  };

  /**
   * Analiza una partida traida de Chess.com.
   *
   * No abre el informe al terminar: en una importacion se encadenan varias y
   * saltar a cada una seria mareante. El valor esta en el conjunto, que se ve
   * en Mi perfil.
   */
  const analizarImportada = async (partida: PartidaChesscom, nivel: PeticionAnalisis['nivel']) => {
    if (!partida.tuColor) throw new Error('No se sabe con que color jugaste esta partida.');
    return api.analizar({
      pgn: partida.pgn,
      nivel,
      colorJugador: partida.tuColor,
      narrar: false,
      fuente: 'chesscom',
      fuenteId: partida.fuenteId,
    });
  };

  /** Analiza una partida importada y abre su repaso: el caso normal. */
  const analizarYAbrir = async (
    partida: PartidaChesscom,
    nivel: PeticionAnalisis['nivel'],
  ): Promise<string | null> => {
    setError(null);
    try {
      const informe = await analizarImportada(partida, nivel);
      setInforme(informe);
      setIndice(primerFalloDe(informe));
      setModo('guion');
      void refrescarHistorico();
      return informe.id;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo analizar la partida.');
      return null;
    }
  };

  /** Analiza sin abrir nada: solo para dar volumen al perfil. */
  const analizarEnLote = async (
    partida: PartidaChesscom,
    nivel: PeticionAnalisis['nivel'],
  ): Promise<boolean> => {
    try {
      await analizarImportada(partida, nivel);
      void refrescarHistorico();
      return true;
    } catch {
      return false;
    }
  };

  const abrirPartida = async (id: string) => {
    setError(null);
    try {
      const r = await api.partida(id);
      setInforme(r);
      setIndice(primerFalloDe(r));
      setModo('guion');
      setPestana('analizar');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo abrir la partida.');
    }
  };

  /**
   * Cambia el bando desde el que se lee la partida.
   *
   * No basta con girar el tablero: el historial y las estadísticas se calculan
   * a partir del color guardado, así que si estaba mal seguirían contando los
   * errores del rival como propios.
   */
  const corregirColor = async (color: Color) => {
    if (!informe) return;
    try {
      const corregido = await api.cambiarColor(informe.id, color);
      setInforme(corregido);
      void refrescarHistorico();
    } catch {
      // Si la partida no estaba guardada, el repaso ya se ve desde el otro
      // bando igualmente: no hay nada que avisar al usuario.
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
    if (!informe || modo !== 'detalle') return;
    const alPulsar = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /input|textarea|select/i.test(e.target.tagName)) return;
      if (e.key === 'ArrowRight') setIndice((i) => Math.min(i + 1, informe.jugadas.length - 1));
      if (e.key === 'ArrowLeft') setIndice((i) => Math.max(i - 1, -1));
      if (e.key === 'Home') setIndice(-1);
      if (e.key === 'End') setIndice(informe.jugadas.length - 1);
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [informe, modo]);

  const jugadaActual = informe && indice >= 0 ? (informe.jugadas[indice] ?? null) : null;
  const orientacion: Color = informe?.colorJugador ?? 'w';

  if (pestana === 'analizar' && informe && !cargando && modo === 'guion') {
    return (
      <Guion
        informe={informe}
        onSalir={() => setInforme(null)}
        onVerDetalle={() => setModo('detalle')}
        onCambiarColor={corregirColor}
        coachIa={coachIa}
      />
    );
  }

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
              ['perfil', 'Mi perfil'],
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
            <ImportarChesscom
              onAnalizarYAbrir={analizarYAbrir}
              onAnalizarEnLote={analizarEnLote}
              onAbrir={abrirPartida}
              onIrAProgreso={() => setPestana('perfil')}
              ocupado={cargando}
            />

            <p className="separador-o">o pega el PGN a mano</p>

            <PgnForm onAnalizar={analizar} cargando={cargando} coachIa={coachIa} />

            {cargando && (
              <div className="tarjeta cargando">
                <div className="spinner" />
                <p>Stockfish esta evaluando cada posicion de la partida…</p>
              </div>
            )}

            {informe && !cargando && (
              <>
                <div className="volver-guion">
                  <button type="button" className="secundario" onClick={() => setModo('guion')}>
                    ← Volver al repaso paso a paso
                  </button>
                </div>

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

        {pestana === 'perfil' && (
          <Perfil perfil={perfil} cargando={cargandoHistorico} coachIa={coachIa} />
        )}

      </main>

      <footer>
        <p>
          Analisis con {motor ?? 'Stockfish'}. Tu historico se guarda en el servidor, ligado a tu
          usuario de Chess.com si has conectado uno, y si no a un identificador de este navegador.
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
