import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'build',
  },
  preview: {
    port: 3030,
  },
  define: {
    // Define env vars for the E2E test
    // VITE_SENTRY_SPOTLIGHT is read automatically by @sentry/react via import.meta.env
    'import.meta.env.VITE_E2E_TEST_DSN': JSON.stringify(
      process.env.E2E_TEST_DSN || 'https://public@dsn.ingest.sentry.io/1234567',
    ),
    'import.meta.env.VITE_SENTRY_SPOTLIGHT': JSON.stringify('http://localhost:3032/stream'),
  },
});
