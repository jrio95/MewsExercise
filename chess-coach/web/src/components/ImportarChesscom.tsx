import { useState } from 'react';
import { api, chesscomActual, conectarChesscom, type PartidaChesscom } from '../lib/api';
import { fechaDia } from '../lib/formato';

interface Props {
  /** Analiza una partida importada; devuelve true si salio bien. */
  onAnalizar: (partida: PartidaChesscom, nivel: 'rapido' | 'normal' | 'profundo') => Promise<boolean>;
  onTerminado: () => void;
  ocupado: boolean;
}

/**
 * Trae partidas de Chess.com por nombre de usuario.
 *
 * Primero se listan y luego el usuario elige: analizar diez partidas lleva su
 * tiempo y no todas interesan. Las que ya estan en el historico se marcan y
 * vienen desmarcadas, para no gastar motor dos veces en lo mismo.
 */
export function ImportarChesscom({ onAnalizar, onTerminado, ocupado }: Props) {
  const [usuario, setUsuario] = useState(chesscomActual() ?? '');
  const [limite, setLimite] = useState(10);
  const [nivel, setNivel] = useState<'rapido' | 'normal' | 'profundo'>('rapido');
  const [partidas, setPartidas] = useState<PartidaChesscom[] | null>(null);
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progreso, setProgreso] = useState<{ hechas: number; total: number } | null>(null);
  const [fallidas, setFallidas] = useState(0);

  const buscar = async (e: React.FormEvent) => {
    e.preventDefault();
    setBuscando(true);
    setError(null);
    setPartidas(null);
    setProgreso(null);
    try {
      const r = await api.chesscom(usuario, limite);
      conectarChesscom(usuario);
      setPartidas(r);
      // Se preseleccionan solo las que aportan algo: nuevas y con tu color claro.
      setElegidas(new Set(r.filter((p) => !p.yaAnalizada && p.tuColor).map((p) => p.fuenteId)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo conectar con Chess.com.');
    } finally {
      setBuscando(false);
    }
  };

  const alternar = (id: string) => {
    setElegidas((previo) => {
      const copia = new Set(previo);
      if (copia.has(id)) copia.delete(id);
      else copia.add(id);
      return copia;
    });
  };

  const analizarTodas = async () => {
    if (!partidas) return;
    const cola = partidas.filter((p) => elegidas.has(p.fuenteId) && p.tuColor);
    setProgreso({ hechas: 0, total: cola.length });
    setFallidas(0);

    // En serie a proposito: el motor es el mismo pool y lanzarlas todas a la vez
    // no acelera nada, solo hace que el progreso deje de significar algo.
    let fallos = 0;
    for (const [i, partida] of cola.entries()) {
      const bien = await onAnalizar(partida, nivel);
      if (!bien) fallos++;
      setProgreso({ hechas: i + 1, total: cola.length });
    }

    setFallidas(fallos);
    setPartidas((previas) =>
      previas?.map((p) => (elegidas.has(p.fuenteId) ? { ...p, yaAnalizada: true } : p)) ?? null,
    );
    onTerminado();
  };

  const seleccionadas = partidas?.filter((p) => elegidas.has(p.fuenteId) && p.tuColor).length ?? 0;

  return (
    <div className="tarjeta importar">
      <h3>Traer de Chess.com</h3>

      <form className="importar-busqueda" onSubmit={buscar}>
        <label>
          <span className="etiqueta">Tu usuario de Chess.com</span>
          <input
            type="text"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            placeholder="p. ej. jrio95"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
          />
        </label>

        <label className="importar-cantidad">
          <span className="etiqueta">Cuantas</span>
          <select value={limite} onChange={(e) => setLimite(Number(e.target.value))}>
            {[5, 10, 20, 30].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>

        <button type="submit" className="secundario" disabled={buscando || !usuario.trim()}>
          {buscando ? 'Buscando…' : 'Buscar'}
        </button>
      </form>

      <p className="importar-nota">
        Tu historico queda ligado a este usuario, asi lo tienes igual en el movil y en el ordenador.
      </p>

      {error && <div className="alerta">{error}</div>}

      {partidas?.length === 0 && (
        <p className="aviso">No se han encontrado partidas recientes de ese usuario.</p>
      )}

      {partidas && partidas.length > 0 && (
        <>
          <ul className="importar-lista">
            {partidas.map((p) => (
              <li key={p.fuenteId} className={p.yaAnalizada ? 'ya' : ''}>
                <label>
                  <input
                    type="checkbox"
                    checked={elegidas.has(p.fuenteId)}
                    onChange={() => alternar(p.fuenteId)}
                    disabled={!p.tuColor || ocupado}
                  />
                  <span className="importar-datos">
                    <span className="importar-rival">
                      {p.tuColor === 'w' ? '⚪' : p.tuColor === 'b' ? '⚫' : '?'} vs {p.rival}
                      {p.eloRival && <span className="importar-elo">{p.eloRival}</span>}
                    </span>
                    <span className="importar-meta">
                      {p.fecha ? fechaDia(p.fecha) : 'sin fecha'} · {p.resultado}
                      {p.controlTiempo && ` · ${p.controlTiempo}`}
                    </span>
                  </span>
                  {p.yaAnalizada && <span className="chip tono-bien">Ya analizada</span>}
                  {!p.tuColor && <span className="chip tono-aviso">No es tuya</span>}
                </label>
              </li>
            ))}
          </ul>

          <div className="importar-acciones">
            <label className="importar-cantidad">
              <span className="etiqueta">Profundidad</span>
              <select value={nivel} onChange={(e) => setNivel(e.target.value as never)} disabled={ocupado}>
                <option value="rapido">Rapida</option>
                <option value="normal">Normal</option>
                <option value="profundo">Profunda</option>
              </select>
            </label>

            <button
              type="button"
              className="primario"
              onClick={analizarTodas}
              disabled={ocupado || seleccionadas === 0}
            >
              {progreso && progreso.hechas < progreso.total
                ? `Analizando ${progreso.hechas + 1} de ${progreso.total}…`
                : `Analizar ${seleccionadas} ${seleccionadas === 1 ? 'partida' : 'partidas'}`}
            </button>
          </div>

          {progreso && (
            <div className="importar-progreso">
              <div
                className="importar-progreso-relleno"
                style={{ width: `${(progreso.hechas / Math.max(progreso.total, 1)) * 100}%` }}
              />
            </div>
          )}

          {progreso?.hechas === progreso?.total && progreso && progreso.total > 0 && (
            <p className="aviso">
              Listo: {progreso.total - fallidas} de {progreso.total} analizadas
              {fallidas > 0 && ` (${fallidas} fallaron)`}. Mira la pestana Progreso.
            </p>
          )}
        </>
      )}
    </div>
  );
}
