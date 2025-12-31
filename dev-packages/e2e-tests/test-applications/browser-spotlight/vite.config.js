import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import replace from '@rollup/plugin-replace';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
  ],
  build: {
    outDir: 'build',
    // Disable minification to help with debugging
    minify: false,
    // Force all dependencies to be bundled (not externalized)
    rollupOptions: {
      plugins: [
        // Use @rollup/plugin-replace to replace import.meta.env.VITE_* in ALL code
        // This runs during the Rollup bundling phase and applies to all modules
        replace({
          preventAssignment: true,
          delimiters: ['', ''],
          values: {
            'import.meta.env.VITE_SENTRY_SPOTLIGHT': JSON.stringify('http://localhost:3032/stream'),
            'import.meta.env.VITE_E2E_TEST_DSN': JSON.stringify(
              process.env.E2E_TEST_DSN || 'https://public@dsn.ingest.sentry.io/1234567',
            ),
          },
        }),
      ],
    },
  },
  preview: {
    port: 3030,
  },
  // Exclude Sentry packages from pre-bundling (esbuild)
  // This forces Vite to use Rollup for these packages during build
  optimizeDeps: {
    exclude: ['@sentry/react', '@sentry/browser', '@sentry/core', '@sentry-internal/browser-utils'],
  },
});
