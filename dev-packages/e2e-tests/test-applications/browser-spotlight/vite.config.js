import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Manually set the env vars we need
  // These will be available as import.meta.env.VITE_* in the app
  process.env.VITE_SENTRY_SPOTLIGHT = 'http://localhost:3032/stream';
  process.env.VITE_E2E_TEST_DSN = process.env.E2E_TEST_DSN || 'https://public@dsn.ingest.sentry.io/1234567';

  return {
    plugins: [react()],
    build: {
      outDir: 'build',
    },
    preview: {
      port: 3030,
    },
    // Use envPrefix to expose VITE_* env vars via import.meta.env
    envPrefix: 'VITE_',
  };
});
