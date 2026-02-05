import { sentryReactRouter } from '@sentry/react-router';
import { unstable_reactRouterRSC } from '@react-router/dev/vite';
import rsc from '@vitejs/plugin-rsc/plugin';
import { defineConfig } from 'vite';

export default defineConfig(async env => ({
  plugins: [
    ...(await sentryReactRouter({}, env)),
    unstable_reactRouterRSC(),
    rsc(),
  ],
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
}));
