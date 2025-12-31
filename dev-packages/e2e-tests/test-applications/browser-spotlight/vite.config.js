import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Output to 'build' directory to match existing setup
    outDir: 'build',
    // Don't minify to help with debugging
    minify: false,
    // Bundle Sentry packages so we can control the resolution
    rollupOptions: {
      // Force rollup to resolve with our conditions
    },
  },
  preview: {
    port: 3030,
  },
  resolve: {
    // Use 'development' condition to resolve SDK packages to their dev builds
    // This is necessary because Spotlight integration code is stripped from production builds
    // The @sentry/browser package exports different builds via conditional exports:
    // - production (default): Spotlight code stripped
    // - development: Spotlight code included
    conditions: ['development'],
  },
  // Disable pre-bundling (esbuild) for Sentry packages
  // This ensures Vite uses our resolve.conditions when bundling
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
