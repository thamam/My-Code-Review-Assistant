import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
  return {
    server: {
      port: 5173,
      host: '0.0.0.0',
      headers: {
        'Cross-Origin-Embedder-Policy': 'credentialless',
        'Cross-Origin-Opener-Policy': 'same-origin',
      },
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        // Neural Patch: Route node:async_hooks to browser polyfill
        'node:async_hooks': path.resolve(__dirname, 'src/polyfills/async_hooks.ts'),
      }
    }
  };
});
