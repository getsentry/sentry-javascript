import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vitejs.dev/config/
// We need to use the SDK's development builds which include Spotlight code.
// The SDK uses conditional exports with 'development' and 'production' conditions.
// By default, Vite uses 'production' when building. We override this with resolve.conditions.
export default defineConfig({
  plugins: [react()],
  build: {
    // Output to 'build' directory to match existing setup
    outDir: 'build',
    // Don't minify to help with debugging
    minify: false,
    // Use rollup's experimental conditions support
    rollupOptions: {
      // This is the key - tell rollup to use 'development' condition
      plugins: [
        {
          name: 'force-development-exports',
          resolveId: {
            order: 'pre',
            async handler(source, importer, options) {
              if (source.startsWith('@sentry/')) {
                // Let Vite handle it with our conditions
                return null;
              }
            },
          },
        },
      ],
    },
  },
  preview: {
    port: 3030,
  },
  resolve: {
    // CRITICAL: Put 'development' FIRST so it takes precedence
    // This tells Vite/Rollup to use the 'development' conditional exports
    // which include the Spotlight integration code
    conditions: ['development', 'browser', 'module', 'import', 'default'],
  },
  // Disable pre-bundling (esbuild) for Sentry packages
  // This ensures Vite/Rollup uses our resolve.conditions when bundling
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
