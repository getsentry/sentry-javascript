import { sentryOrchestrionPlugin } from '@sentry/node/orchestrion/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sentryOrchestrionPlugin()],
  build: {
    target: 'node18',
    ssr: true,
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: ['src/app.ts', 'src/instrument.ts'],
      output: {
        format: 'esm',
      },
    },
  },
  ssr: {
    noExternal: ['mysql'],
  },
});
