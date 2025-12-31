import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vitejs.dev/config/
// We use mode: 'development' to ensure Vite resolves packages using the 'development'
// conditional export. This is necessary because:
// 1. The SDK's Spotlight integration code is stripped from production builds
// 2. The @sentry/browser package uses conditional exports (development vs production)
// 3. When mode is 'development', Vite adds 'development' to resolve.conditions
export default defineConfig({
  // CRITICAL: Use development mode so Vite resolves to SDK dev builds
  // This ensures the Spotlight integration code is included
  mode: 'development',
  plugins: [react()],
  build: {
    // Output to 'build' directory to match existing setup
    outDir: 'build',
    // Don't minify to help with debugging
    minify: false,
  },
  preview: {
    port: 3030,
  },
  // Disable pre-bundling (esbuild) for Sentry packages
  // This ensures Vite/Rollup uses our mode's conditions when bundling
  optimizeDeps: {
    exclude: ['@sentry/react', '@sentry/browser', '@sentry/core', '@sentry-internal/browser-utils'],
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
