import express from 'express';
import compression from 'compression';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { api } from './routes/api.js';
import { pool } from './engine/pool.js';
import { getDb, cerrarDb } from './db/index.js';
import { ENGINE_PATH, PORT } from './config.js';

const here = dirname(fileURLToPath(import.meta.url));
const app = express();

app.disable('x-powered-by');
app.use(compression());
app.use(express.json({ limit: '1mb' }));

app.use('/api', api);

// En produccion el servidor sirve tambien la SPA compilada. En desarrollo el
// front lo sirve Vite en otro puerto y este bloque no se activa.
const estaticos = join(here, 'public');
if (existsSync(estaticos)) {
  app.use(express.static(estaticos, { maxAge: '1h', index: false }));
  app.get('*', (_req, res) => res.sendFile(join(estaticos, 'index.html')));
}

// Fallamos rapido al arrancar si falta el motor: es mejor que descubrirlo en la
// primera peticion del usuario.
getDb();
const motorOk = await pool.healthy();
if (!motorOk) {
  console.error(`[arranque] no se encuentra Stockfish en "${ENGINE_PATH}".`);
  console.error('[arranque] instala stockfish o define STOCKFISH_PATH.');
  process.exit(1);
}

const servidor = app.listen(PORT, () => {
  console.log(`chess-coach escuchando en http://0.0.0.0:${PORT} (motor: ${ENGINE_PATH})`);
});

for (const senal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(senal, () => {
    servidor.close(() => {
      pool.shutdown();
      cerrarDb();
      process.exit(0);
    });
  });
}
