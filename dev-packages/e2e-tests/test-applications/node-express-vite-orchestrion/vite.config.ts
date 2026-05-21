import { sentryOrchestrionPlugin } from '@sentry/node/orchestrion/vite';
import { defineConfig } from 'vite';

export default defineConfig(async () => ({
  plugins: await sentryOrchestrionPlugin(),
  build: {
    target: 'node18',
    ssr: true,
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: 'src/app.ts',
      output: {
        format: 'esm',
        entryFileNames: 'app.js',
      },
    },
  },
}));
