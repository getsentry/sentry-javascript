import { defineConfig } from 'vite';
import { extensions, ember, classicEmberSupport } from '@embroider/vite';
import { babel } from '@rollup/plugin-babel';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// For scenario testing
const isCompat = Boolean(process.env.ENABLE_COMPAT_BUILD);

export default defineConfig({
  plugins: [
    ...(isCompat ? [classicEmberSupport()] : []),
    ember(),
    babel({
      babelHelpers: 'inline',
      extensions,
    }),
  ],
  resolve: {
    // Monorepo workaround: in the sentry-javascript monorepo, @sentry/* packages
    // resolve to workspace symlinks (raw TS sources). We alias them to either the
    // built dist/ or npm-downloaded copies so Vite can bundle the test app.
    // This section can be removed if the addon is ever extracted to its own repo.
    alias: {
      '@sentry/ember': resolve(__dirname, 'dist/index.js'),
      '@sentry/browser': resolve(__dirname, '.npm-deps/browser'),
      '@sentry/core': resolve(__dirname, '.npm-deps/core'),
      '@sentry-internal/browser-utils': resolve(
        __dirname,
        '.npm-deps/browser-utils',
      ),
      '@sentry-internal/feedback': resolve(__dirname, '.npm-deps/feedback'),
      '@sentry-internal/replay': resolve(__dirname, '.npm-deps/replay'),
      '@sentry-internal/replay-canvas': resolve(
        __dirname,
        '.npm-deps/replay-canvas',
      ),
    },
  },
  build: {
    rollupOptions: {
      input: {
        tests: 'tests/index.html',
      },
    },
  },
});
