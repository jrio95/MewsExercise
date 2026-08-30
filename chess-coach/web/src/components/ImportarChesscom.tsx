import { useEffect, useState } from 'react';
import { api, chesscomActual, conectarChesscom, type PartidaChesscom } from '../lib/api';
import { fechaDia } from '../lib/formato';

type Nivel = 'rapido' | 'normal' | 'profundo';

interface Props {
  /** Analiza una partida y abre su repaso; devuelve el id guardado. */
  onAnalizarYAbrir: (partida: PartidaChesscom, nivel: Nivel) => Promise<string | null>;
  /** Analiza en segundo plano, sin abrir nada; devuelve si salio bien. */
  onAnalizarEnLote: (partida: PartidaChesscom, nivel: Nivel) => Promise<boolean>;
  /** Abre el informe de una partida ya analizada. */
  onAbrir: (partidaId: string) => void;
  /** Al terminar un lote, llevar al usuario donde se ve el resultado. */
  onIrAProgreso: () => void;
  ocupado: boolean;
}

/**
 * Trae partidas de Chess.com por nombre de usuario.
 *
 * Cada partida se analiza y se abre por si sola: es lo que se quiere hacer el
 * 90% de las veces. El analisis en lote se mantiene aparte y en segundo plano
 * porque sirve para otra cosa distinta: dar volumen a la deteccion de patrones,
 * que con dos partidas no puede decir nada. Por eso al acabar lleva a Progreso,
 * que es donde ese trabajo se ve.
 */
/**
 * La lista se guarda en la sesion del navegador.
 *
 * Al analizar una partida se abre su repaso a pantalla completa, lo que
 * desmonta este componente; sin esto, al volver habria que buscar otra vez.
 */
const CLAVE_LISTA = 'chess-coach:importadas';

function listaGuardada(): PartidaChesscom[] | null {
  try {
    const bruto = sessionStorage.getItem(CLAVE_LISTA);
    return bruto ? (JSON.parse(bruto) as PartidaChesscom[]) : null;
  } catch {
    return null;
  }
}

function guardarLista(lista: PartidaChesscom[] | null): void {
  try {
    if (lista) sessionStorage.setItem(CLAVE_LISTA, JSON.stringify(lista));
    else sessionStorage.removeItem(CLAVE_LISTA);
  } catch {
    // Sin sessionStorage la lista simplemente no sobrevive: no es critico.
  }
}

export function ImportarChesscom({
  onAnalizarYAbrir,
  onAnalizarEnLote,
  onAbrir,
  onIrAProgreso,
  ocupado,
}: Props) {
  const [usuario, setUsuario] = useState(chesscomActual() ?? '');
  const [limite, setLimite] = useState(10);
  const [nivel, setNivel] = useState<Nivel>('rapido');
  const [partidas, setPartidas] = useState<PartidaChesscom[] | null>(listaGuardada);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analizando, setAnalizando] = useState<string | null>(null);
  const [lote, setLote] = useState<{ hechas: number; total: number; fallidas: number } | null>(null);

  useEffect(() => {
    guardarLista(partidas);
  }, [partidas]);

  /**
   * Marca filas como analizadas para que pasen a ofrecer "Ver".
   *
   * Se escribe en sessionStorage a mano y no solo por el efecto: analizar una
   * partida abre su repaso a pantalla completa, lo que desmonta este componente
   * antes de que React llegue a guardar el cambio.
   */
  const marcarAnalizadas = (cambios: Map<string, string>) => {
    const actualizada =
      partidas?.map((p) => {
        const id = cambios.get(p.fuenteId);
        return id ? { ...p, yaAnalizada: true, partidaId: id } : p;
      }) ?? null;

    guardarLista(actualizada);
    setPartidas(actualizada);
  };

  const buscar = async (e: React.FormEvent) => {
    e.preventDefault();
    setBuscando(true);
    setError(null);
    setPartidas(null);
    setLote(null);
    try {
      const r = await api.chesscom(usuario, limite);
      conectarChesscom(usuario);
      setPartidas(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo conectar con Chess.com.');
    } finally {
      setBuscando(false);
    }
  };

  const analizarUna = async (p: PartidaChesscom) => {
    if (!p.tuColor) return;
    setAnalizando(p.fuenteId);
    try {
      const id = await onAnalizarYAbrir(p, nivel);
      if (id) marcarAnalizadas(new Map([[p.fuenteId, id]]));
    } finally {
      setAnalizando(null);
    }
  };

  const pendientes = partidas?.filter((p) => !p.yaAnalizada && p.tuColor) ?? [];

  const analizarPendientes = async () => {
    setLote({ hechas: 0, total: pendientes.length, fallidas: 0 });
    let fallidas = 0;

    // En serie a proposito: el motor es el mismo pool, lanzarlas a la vez no
    // acelera nada y hace que el progreso deje de significar algo.
    for (const [i, partida] of pendientes.entries()) {
      const bien = await onAnalizarEnLote(partida, nivel);
      if (!bien) fallidas++;
      setLote({ hechas: i + 1, total: pendientes.length, fallidas });
    }

    // El lote no abre nada, asi que no hay id que guardar: basta con marcarlas.
    const tras = partidas?.map((p) => (pendientes.includes(p) ? { ...p, yaAnalizada: true } : p)) ?? null;
    guardarLista(tras);
    setPartidas(tras);
    onIrAProgreso();
  };

  const enMarcha = ocupado || analizando !== null || (lote !== null && lote.hechas < lote.total);

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
          <label className="importar-nivel">
            <span className="etiqueta">Profundidad del analisis</span>
            <select value={nivel} onChange={(e) => setNivel(e.target.value as Nivel)} disabled={enMarcha}>
              <option value="rapido">Rapida (unos segundos)</option>
              <option value="normal">Normal (recomendada)</option>
              <option value="profundo">Profunda (mas lenta)</option>
            </select>
          </label>

          <ul className="importar-lista">
            {partidas.map((p) => (
              <li key={p.fuenteId}>
                <span className="importar-datos">
                  <span className="importar-rival">
                    <span className={`bolita ${p.tuColor === 'w' ? 'blancas' : 'negras'}`} />
                    {p.rival}
                    {p.eloRival && <span className="importar-elo">{p.eloRival}</span>}
                  </span>
                  <span className="importar-meta">
                    {p.fecha ? fechaDia(p.fecha) : 'sin fecha'} · {p.resultado}
                    {p.controlTiempo && ` · ${p.controlTiempo}`}
                  </span>
                </span>

                {!p.tuColor ? (
                  <span className="chip tono-aviso">No es tuya</span>
                ) : p.yaAnalizada && p.partidaId ? (
                  <button
                    type="button"
                    className="importar-boton ver"
                    onClick={() => onAbrir(p.partidaId!)}
                    disabled={enMarcha}
                  >
                    Ver
                  </button>
                ) : (
                  <button
                    type="button"
                    className="importar-boton"
                    onClick={() => analizarUna(p)}
                    disabled={enMarcha}
                  >
                    {analizando === p.fuenteId ? 'Analizando…' : 'Analizar'}
                  </button>
                )}
              </li>
            ))}
          </ul>

          {pendientes.length > 1 && (
            <div className="importar-lote">
              <button
                type="button"
                className="enlace-lote"
                onClick={analizarPendientes}
                disabled={enMarcha}
              >
                {lote && lote.hechas < lote.total
                  ? `Analizando ${lote.hechas + 1} de ${lote.total}…`
                  : `Analizar las ${pendientes.length} de golpe`}
              </button>
              <span className="importar-lote-nota">
                Sin abrirlas: sirve para que Progreso tenga datos con los que detectar tus patrones.
              </span>
            </div>
          )}

          {lote && (
            <div className="importar-progreso">
              <div
                className="importar-progreso-relleno"
                style={{ width: `${(lote.hechas / Math.max(lote.total, 1)) * 100}%` }}
              />
            </div>
          )}

          {lote && lote.hechas === lote.total && lote.total > 0 && (
            <p className="aviso">
              {lote.total - lote.fallidas} de {lote.total} analizadas
              {lote.fallidas > 0 && ` (${lote.fallidas} fallaron)`}.
            </p>
          )}
        </>
      )}
    </div>
  );
}
