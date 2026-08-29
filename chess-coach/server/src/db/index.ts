import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR } from '../config.js';

let db: Database.Database | null = null;

/**
 * Base SQLite unica, creada bajo demanda.
 *
 * Se guarda en DATA_DIR, que en Railway apunta a un volumen persistente. Si el
 * dia de manana el historico crece, migrar a Postgres solo obliga a reescribir
 * este modulo y `games.ts`: el resto de la aplicacion no conoce el motor.
 */
export function getDb(): Database.Database {
  if (db) return db;

  mkdirSync(DATA_DIR, { recursive: true });
  db = new Database(join(DATA_DIR, 'chess-coach.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrar(db);
  return db;
}

function migrar(d: Database.Database): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS partidas (
      id            TEXT PRIMARY KEY,
      usuario       TEXT NOT NULL,
      creado_en     TEXT NOT NULL,
      blancas       TEXT NOT NULL,
      negras        TEXT NOT NULL,
      resultado     TEXT NOT NULL,
      color_jugador TEXT NOT NULL,
      eco           TEXT,
      apertura      TEXT,
      precision     REAL NOT NULL,
      graves        INTEGER NOT NULL DEFAULT 0,
      errores       INTEGER NOT NULL DEFAULT 0,
      imprecisiones INTEGER NOT NULL DEFAULT 0,
      nivel         TEXT NOT NULL,
      pgn           TEXT NOT NULL,
      informe       TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_partidas_usuario ON partidas (usuario, creado_en DESC);

    -- Una fila por etiqueta y partida: hace trivial agregar "errores mas
    -- frecuentes" sin tener que releer y parsear todos los informes.
    CREATE TABLE IF NOT EXISTS etiquetas (
      partida_id TEXT NOT NULL REFERENCES partidas (id) ON DELETE CASCADE,
      usuario    TEXT NOT NULL,
      etiqueta   TEXT NOT NULL,
      veces      INTEGER NOT NULL,
      PRIMARY KEY (partida_id, etiqueta)
    );

    CREATE INDEX IF NOT EXISTS idx_etiquetas_usuario ON etiquetas (usuario, etiqueta);

    CREATE TABLE IF NOT EXISTS fases (
      partida_id    TEXT NOT NULL REFERENCES partidas (id) ON DELETE CASCADE,
      usuario       TEXT NOT NULL,
      fase          TEXT NOT NULL,
      jugadas       INTEGER NOT NULL,
      perdida_media REAL NOT NULL,
      PRIMARY KEY (partida_id, fase)
    );

    CREATE INDEX IF NOT EXISTS idx_fases_usuario ON fases (usuario, fase);
  `);
}

export function cerrarDb(): void {
  db?.close();
  db = null;
}
