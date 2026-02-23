import { sentryReactRouter } from '@sentry/react-router';
import { unstable_reactRouterRSC } from '@react-router/dev/vite';
import rsc from '@vitejs/plugin-rsc/plugin';
import { defineConfig } from 'vite';

export default defineConfig(async env => ({
  plugins: [
    ...(await sentryReactRouter({ experimental_rscAutoInstrumentation: { enabled: true } }, env)),
    unstable_reactRouterRSC(),
    rsc(),
  ],
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
