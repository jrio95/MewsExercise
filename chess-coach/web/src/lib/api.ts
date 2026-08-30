import type { InformePartida, PartidaResumida, PerfilJugador } from '@shared';

/**
 * Identificador de usuario local.
 *
 * No hay cuentas: cada navegador genera el suyo y lo manda en una cabecera,
 * de modo que el historico no se mezcla entre personas que usen el mismo
 * despliegue. Se puede exportar/importar copiandolo a mano.
 */
const CLAVE_USUARIO = 'chess-coach:usuario';
const CLAVE_CHESSCOM = 'chess-coach:chesscom';

export function usuarioActual(): string {
  let id = localStorage.getItem(CLAVE_USUARIO);
  if (!id || !/^[A-Za-z0-9_-]{3,64}$/.test(id)) {
    id = crypto.randomUUID().replace(/-/g, '').slice(0, 24);
    localStorage.setItem(CLAVE_USUARIO, id);
  }
  return id;
}

/** Usuario de Chess.com conectado, si lo hay. */
export function chesscomActual(): string | null {
  return localStorage.getItem(CLAVE_CHESSCOM);
}

/**
 * Ata el historico al usuario de Chess.com.
 *
 * Es lo que hace que el historico siga al jugador de un dispositivo a otro sin
 * necesidad de contrasenas: el nombre de Chess.com pasa a ser su identidad.
 */
export function conectarChesscom(usuario: string): void {
  const limpio = usuario.trim();
  localStorage.setItem(CLAVE_CHESSCOM, limpio);
  localStorage.setItem(CLAVE_USUARIO, `cc-${limpio.toLowerCase()}`);
}

export function desconectarChesscom(): void {
  localStorage.removeItem(CLAVE_CHESSCOM);
  localStorage.removeItem(CLAVE_USUARIO);
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
  /** Siempre explícito: adivinarlo llevaba a analizar la partida del bando equivocado. */
  colorJugador: 'w' | 'b';
  nombreJugador?: string;
  narrar: boolean;
  /** Origen, cuando la partida viene importada y no pegada a mano. */
  fuente?: string;
  fuenteId?: string;
}

/** Partida de Chess.com todavia sin analizar. */
export interface PartidaChesscom {
  fuenteId: string;
  pgn: string;
  fecha: string | null;
  blancas: string;
  negras: string;
  resultado: string;
  tuColor: 'w' | 'b' | null;
  rival: string;
  eloRival: string | null;
  controlTiempo: string | null;
  enlace: string | null;
  yaAnalizada: boolean;
  /** Id de la partida ya guardada, para poder abrir su informe. */
  partidaId: string | null;
}

export const api = {
  salud: () =>
    peticion<{ ok: boolean; motor: string; procesos: number; coachIa: boolean }>('/salud'),

  analizar: (datos: PeticionAnalisis) =>
    peticion<InformePartida>('/analizar', { method: 'POST', body: JSON.stringify(datos) }),

  partidas: () => peticion<PartidaResumida[]>('/partidas'),

  chesscom: (usuario: string, limite = 10) =>
    peticion<PartidaChesscom[]>(
      `/chesscom/${encodeURIComponent(usuario)}?limite=${limite}`,
    ),

  partida: (id: string) => peticion<InformePartida>(`/partidas/${id}`),

  borrar: (id: string) => peticion<void>(`/partidas/${id}`, { method: 'DELETE' }),

  /** Pide (o recupera de caché) el razonamiento del modelo sobre una jugada. */
  porQue: (id: string, ply: number) =>
    peticion<{ porQue: string; cacheada: boolean }>(`/partidas/${id}/por-que`, {
      method: 'POST',
      body: JSON.stringify({ ply }),
    }),

  /** Corrige el bando de una partida guardada, sin volver a analizarla. */
  cambiarColor: (id: string, colorJugador: 'w' | 'b') =>
    peticion<InformePartida>(`/partidas/${id}/color`, {
      method: 'PATCH',
      body: JSON.stringify({ colorJugador }),
    }),

  perfil: () => peticion<PerfilJugador>('/perfil'),

  /** Informe del entrenador sobre el perfil; el servidor lo cachea. */
  informePerfil: () =>
    peticion<{ informe: string; cacheado: boolean }>('/perfil/informe', { method: 'POST' }),
};
