import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Los tipos del dominio viven en el servidor y se importan solo como
      // tipos, asi que desaparecen al compilar: no hay dependencia en runtime.
      '@shared': fileURLToPath(new URL('../server/src/types.ts', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:8080' },
  },
  build: { outDir: 'dist', sourcemap: false },
});
