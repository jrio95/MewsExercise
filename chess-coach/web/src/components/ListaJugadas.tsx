import { useEffect, useRef } from 'react';
import type { Color, JugadaAnalizada } from '@shared';
import { SIMBOLO_CALIDAD } from '../lib/formato';

interface Props {
  jugadas: JugadaAnalizada[];
  indiceActivo: number;
  onSeleccionar: (indice: number) => void;
  /** Si se marca, solo se listan las jugadas de este color. */
  filtroColor: Color | null;
}

/** Listado navegable de la partida, con el sello de calidad de cada jugada. */
export function ListaJugadas({ jugadas, indiceActivo, onSeleccionar, filtroColor }: Props) {
  const contenedor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    contenedor.current
      ?.querySelector('[data-activa="true"]')
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [indiceActivo]);

  const parejas: { numero: number; blancas?: JugadaAnalizada; negras?: JugadaAnalizada }[] = [];
  for (const j of jugadas) {
    let pareja = parejas.find((p) => p.numero === j.numeroJugada);
    if (!pareja) {
      pareja = { numero: j.numeroJugada };
      parejas.push(pareja);
    }
    if (j.color === 'w') pareja.blancas = j;
    else pareja.negras = j;
  }

  const celda = (j: JugadaAnalizada | undefined) => {
    if (!j) return <span className="hueco">—</span>;
    const atenuada = filtroColor !== null && j.color !== filtroColor;
    return (
      <button
        type="button"
        className={`jugada calidad-${j.calidad} ${atenuada ? 'atenuada' : ''}`}
        data-activa={jugadas.indexOf(j) === indiceActivo}
        onClick={() => onSeleccionar(jugadas.indexOf(j))}
        title={j.comentario ?? undefined}
      >
        {j.san}
        <span className="sello">{SIMBOLO_CALIDAD[j.calidad]}</span>
      </button>
    );
  };

  return (
    <div className="lista-jugadas" ref={contenedor}>
      {parejas.map((p) => (
        <div className="pareja" key={p.numero}>
          <span className="numero">{p.numero}.</span>
          {celda(p.blancas)}
          {celda(p.negras)}
        </div>
      ))}
    </div>
  );
}
