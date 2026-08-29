import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

interface Props {
  partidaId: string;
  ply: number;
  /** Razonamiento ya guardado en el informe, si lo hubiera. */
  guardado: string | null | undefined;
  /** Solo se ofrece si el servidor tiene clave de IA configurada. */
  disponible: boolean;
}

/**
 * Pide al modelo el razonamiento de una jugada, bajo demanda.
 *
 * No se genera durante el análisis porque cada explicación es una llamada de
 * pago y el jugador solo quiere el porqué de las jugadas que le llaman la
 * atención. El servidor la cachea, así que volver a esta pantalla es gratis.
 */
export function PorQue({ partidaId, ply, guardado, disponible }: Props) {
  const [texto, setTexto] = useState<string | null>(guardado ?? null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bloque = useRef<HTMLDivElement>(null);

  // Al cambiar de jugada hay que olvidar la explicación anterior.
  useEffect(() => {
    setTexto(guardado ?? null);
    setCargando(false);
    setError(null);
  }, [ply, guardado]);

  if (!disponible) return null;

  // El razonamiento aparece al final del panel, que puede estar desplazado: sin
  // esto el usuario pulsa el boton y aparentemente no pasa nada.
  useEffect(() => {
    if (texto) bloque.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [texto]);

  const pedir = async () => {
    setCargando(true);
    setError(null);
    try {
      const r = await api.porQue(partidaId, ply);
      setTexto(r.porQue);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar la explicacion.');
    } finally {
      setCargando(false);
    }
  };

  if (texto) {
    return (
      <div className="por-que" ref={bloque}>
        <span className="etiqueta">Por qué</span>
        {texto.split('\n').filter(Boolean).map((p) => (
          <p key={p}>{p}</p>
        ))}
      </div>
    );
  }

  return (
    <div className="por-que-accion">
      <button type="button" className="boton-porque" onClick={pedir} disabled={cargando}>
        {cargando ? 'Pensando…' : '¿Por qué? Pídeme el razonamiento'}
      </button>
      {error && <p className="por-que-error">{error}</p>}
    </div>
  );
}
