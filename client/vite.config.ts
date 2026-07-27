import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Alias the shared simulation to its TypeScript source so the client always
// builds against the live code (single source of truth, no stale dist in dev).
const sharedSrc = fileURLToPath(new URL('../shared/src/index.ts', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@badminton/shared': sharedSrc,
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Forward the WebSocket endpoint to the game server during dev.
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
  },
});
