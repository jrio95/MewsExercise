import { cpus } from 'node:os';
import { UciEngine, type AnalysisResult } from './uci.js';

const DEFAULT_SIZE = Math.max(1, Math.min(4, cpus().length));
const POOL_SIZE = Number(process.env.ENGINE_POOL_SIZE ?? DEFAULT_SIZE);

interface Job {
  fen: string;
  depth: number;
  resolve: (r: AnalysisResult) => void;
  reject: (e: unknown) => void;
}

/**
 * Pool de procesos de Stockfish.
 *
 * Las posiciones de una partida son independientes entre si, asi que repartir
 * los FEN entre varios procesos reduce el tiempo de analisis de forma lineal.
 * Ademas evita que dos usuarios simultaneos se bloqueen mutuamente.
 */
class EnginePool {
  private engines: { engine: UciEngine; free: boolean }[] = [];
  private queue: Job[] = [];

  private ensureEngines(): void {
    if (this.engines.length > 0) return;
    for (let i = 0; i < POOL_SIZE; i++) {
      this.engines.push({ engine: new UciEngine(), free: true });
    }
  }

  analyse(fen: string, depth: number): Promise<AnalysisResult> {
    this.ensureEngines();
    return new Promise((resolve, reject) => {
      this.queue.push({ fen, depth, resolve, reject });
      this.drain();
    });
  }

  private drain(): void {
    for (const slot of this.engines) {
      if (!slot.free || this.queue.length === 0) continue;
      const job = this.queue.shift()!;
      slot.free = false;
      slot.engine
        .analyse(job.fen, job.depth)
        .then(job.resolve, (err) => {
          // Un motor caido no debe envenenar el pool: lo reemplazamos.
          slot.engine.kill();
          slot.engine = new UciEngine();
          job.reject(err);
        })
        .finally(() => {
          slot.free = true;
          this.drain();
        });
    }
  }

  /** Analiza un lote de FEN conservando el orden de entrada. */
  async analyseAll(fens: string[], depth: number): Promise<AnalysisResult[]> {
    return Promise.all(fens.map((fen) => this.analyse(fen, depth)));
  }

  async healthy(): Promise<boolean> {
    try {
      const r = await this.analyse('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 5);
      return r.bestMove !== null;
    } catch {
      return false;
    }
  }

  shutdown(): void {
    for (const slot of this.engines) slot.engine.kill();
    this.engines = [];
  }
}

export const pool = new EnginePool();
export const poolSize = POOL_SIZE;
