import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface, type Interface } from 'node:readline';
import { ENGINE_PATH, ENGINE_HASH_MB, ENGINE_THREADS } from '../config.js';

export interface Score {
  /** Evaluacion en centipeones desde el punto de vista del que mueve. */
  cp: number | null;
  /** Mate en N jugadas (positivo = mate a favor del que mueve). */
  mate: number | null;
}

export interface AnalysisResult extends Score {
  /** Mejor jugada en notacion UCI, p.ej. "e2e4". null si es mate/ahogado. */
  bestMove: string | null;
  /** Linea principal en UCI. */
  pv: string[];
  depth: number;
}

/**
 * Envoltura minima del protocolo UCI sobre un proceso de Stockfish.
 *
 * Una instancia = un proceso = una peticion a la vez. La serializacion la hace
 * el pool (`pool.ts`); aqui solo garantizamos que no se solapen comandos
 * dentro de la misma instancia.
 */
export class UciEngine {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private rl: Interface | null = null;
  private listeners: ((line: string) => void)[] = [];
  private ready: Promise<void> | null = null;
  private busy = false;

  async start(): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = this.boot();
    return this.ready;
  }

  private async boot(): Promise<void> {
    const proc = spawn(ENGINE_PATH, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.proc = proc;
    proc.on('error', (err) => {
      console.error(`[uci] no se pudo lanzar el motor en "${ENGINE_PATH}":`, err.message);
      this.kill();
    });
    proc.on('exit', (code) => {
      if (code !== 0 && code !== null) console.error(`[uci] el motor termino con codigo ${code}`);
      this.reset();
    });

    this.rl = createInterface({ input: proc.stdout });
    this.rl.on('line', (line) => {
      for (const l of [...this.listeners]) l(line);
    });

    await this.send('uci', (line) => line === 'uciok');
    this.write(`setoption name Threads value ${ENGINE_THREADS}`);
    this.write(`setoption name Hash value ${ENGINE_HASH_MB}`);
    await this.isReady();
  }

  private write(cmd: string): void {
    this.proc?.stdin.write(`${cmd}\n`);
  }

  /** Envia un comando y resuelve cuando `done` reconoce una linea de salida. */
  private send(cmd: string, done: (line: string) => boolean, timeoutMs = 60_000): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const collected: string[] = [];
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`[uci] timeout esperando respuesta a "${cmd}"`));
      }, timeoutMs);

      const onLine = (line: string) => {
        collected.push(line);
        if (done(line)) {
          cleanup();
          resolve(collected);
        }
      };
      const cleanup = () => {
        clearTimeout(timer);
        this.listeners = this.listeners.filter((l) => l !== onLine);
      };

      this.listeners.push(onLine);
      this.write(cmd);
    });
  }

  private async isReady(): Promise<void> {
    await this.send('isready', (line) => line === 'readyok', 20_000);
  }

  /** Analiza una posicion FEN a la profundidad indicada. */
  async analyse(fen: string, depth: number): Promise<AnalysisResult> {
    await this.start();
    if (this.busy) throw new Error('[uci] instancia ocupada; usa el pool');
    this.busy = true;
    try {
      this.write(`position fen ${fen}`);
      const lines = await this.send(`go depth ${depth}`, (l) => l.startsWith('bestmove'));
      return parseSearch(lines);
    } finally {
      this.busy = false;
    }
  }

  /** Limpia las tablas de transposicion entre partidas distintas. */
  async newGame(): Promise<void> {
    await this.start();
    this.write('ucinewgame');
    await this.isReady();
  }

  private reset(): void {
    this.rl?.close();
    this.rl = null;
    this.proc = null;
    this.ready = null;
    this.busy = false;
  }

  kill(): void {
    this.proc?.kill();
    this.reset();
  }
}

/**
 * Extrae la evaluacion final de la salida de `go`.
 *
 * Stockfish emite una linea `info` por iteracion; nos quedamos con la ultima
 * que trae `score`, que corresponde a la profundidad mas alta alcanzada.
 */
export function parseSearch(lines: string[]): AnalysisResult {
  let cp: number | null = null;
  let mate: number | null = null;
  let pv: string[] = [];
  let depth = 0;
  let bestMove: string | null = null;

  for (const line of lines) {
    if (line.startsWith('bestmove')) {
      const mv = line.split(/\s+/)[1];
      bestMove = mv && mv !== '(none)' ? mv : null;
      continue;
    }
    if (!line.startsWith('info ') || !line.includes(' score ')) continue;

    const tokens = line.split(/\s+/);
    const depthIdx = tokens.indexOf('depth');
    if (depthIdx !== -1) depth = Number(tokens[depthIdx + 1] ?? depth);

    const scoreIdx = tokens.indexOf('score');
    const kind = tokens[scoreIdx + 1];
    const value = Number(tokens[scoreIdx + 2]);
    if (kind === 'cp') {
      cp = value;
      mate = null;
    } else if (kind === 'mate') {
      mate = value;
      cp = null;
    }

    const pvIdx = tokens.indexOf('pv');
    if (pvIdx !== -1) pv = tokens.slice(pvIdx + 1);
  }

  return { cp, mate, bestMove, pv, depth };
}
