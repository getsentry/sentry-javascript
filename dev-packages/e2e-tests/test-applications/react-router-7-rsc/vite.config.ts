import { unstable_reactRouterRSC } from '@react-router/dev/vite';
import rsc from '@vitejs/plugin-rsc/plugin';
import { defineConfig } from 'vite';

// RSC Framework Mode (Preview - React Router 7.9.2+)
// This enables React Server Components support in React Router
export default defineConfig({
  plugins: [unstable_reactRouterRSC(), rsc()],
  // Exclude chokidar from RSC bundling - it's a CommonJS file watcher
  // that causes parse errors when the RSC plugin tries to process it
  optimizeDeps: {
    exclude: ['chokidar'],
  },
  ssr: {
    external: ['chokidar'],
  },
  build: {
    rollupOptions: {
      external: ['chokidar'],
    },
  },
});
