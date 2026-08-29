import type { EstadisticasGlobales, InformePartida, PartidaResumida } from '@shared';

/**
 * Identificador de usuario local.
 *
 * No hay cuentas: cada navegador genera el suyo y lo manda en una cabecera,
 * de modo que el historico no se mezcla entre personas que usen el mismo
 * despliegue. Se puede exportar/importar copiandolo a mano.
 */
const CLAVE_USUARIO = 'chess-coach:usuario';

export function usuarioActual(): string {
  let id = localStorage.getItem(CLAVE_USUARIO);
  if (!id || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
    id = crypto.randomUUID().replace(/-/g, '').slice(0, 24);
    localStorage.setItem(CLAVE_USUARIO, id);
  }
  return id;
}

export function fijarUsuario(id: string): void {
  localStorage.setItem(CLAVE_USUARIO, id);
}

async function peticion<T>(ruta: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${ruta}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-coach-user': usuarioActual(),
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const cuerpo = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(cuerpo?.error ?? `Error ${res.status}`);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export interface PeticionAnalisis {
  pgn: string;
  nivel: 'rapido' | 'normal' | 'profundo';
  colorJugador: 'w' | 'b' | 'auto';
  nombreJugador?: string;
  narrar: boolean;
}

export const api = {
  salud: () =>
    peticion<{ ok: boolean; motor: string; procesos: number; coachIa: boolean }>('/salud'),

  analizar: (datos: PeticionAnalisis) =>
    peticion<InformePartida>('/analizar', { method: 'POST', body: JSON.stringify(datos) }),

  partidas: () => peticion<PartidaResumida[]>('/partidas'),

  partida: (id: string) => peticion<InformePartida>(`/partidas/${id}`),

  borrar: (id: string) => peticion<void>(`/partidas/${id}`, { method: 'DELETE' }),

  estadisticas: () => peticion<EstadisticasGlobales>('/estadisticas'),
};
