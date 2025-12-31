import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'build',
    // Disable minification to help with debugging
    minify: false,
    // Force rollup to process all modules (don't skip node_modules)
    commonjsOptions: {
      include: [/node_modules/],
      transformMixedEsModules: true,
    },
  },
  preview: {
    port: 3030,
  },
  // Use envPrefix to expose VITE_* env vars via import.meta.env
  envPrefix: 'VITE_',
  // Exclude Sentry packages from pre-bundling (esbuild)
  // This forces Vite to use Rollup for these packages, which respects our define replacements
  optimizeDeps: {
    exclude: ['@sentry/react', '@sentry/browser', '@sentry/core', '@sentry-internal/browser-utils'],
  },
  // Use define to statically replace import.meta.env.* values at build time
  // This is the reliable way to ensure Vite replaces these values in all code
  define: {
    'import.meta.env.VITE_SENTRY_SPOTLIGHT': JSON.stringify('http://localhost:3032/stream'),
    'import.meta.env.VITE_E2E_TEST_DSN': JSON.stringify(
      process.env.E2E_TEST_DSN || 'https://public@dsn.ingest.sentry.io/1234567',
    ),
  },
});
