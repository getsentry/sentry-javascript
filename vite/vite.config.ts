import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    __DEBUG_BUILD__: true,
  },
  test: {
    server: {
      deps: {
        // `@sentry/conventions` is vendored into our build output (under `build/esm/node_modules/...`)
        // as ESM `.js` files. Vitest externalizes anything under a `node_modules/` path and loads it via
        // native `require`, which fails on Node 18 ("ES Module shipped in a CommonJS package") because
        // Node <20.19 can't `require()` ESM. Inlining makes Vitest transform it instead, so it works on
        // all supported Node versions. Production is unaffected (the package resolves via its exports map).
        inline: [/@sentry[/\\]conventions/],
      },
    },
    coverage: {
      enabled: true,
      reportsDirectory: './coverage',
      exclude: [
        '**/node_modules/**',
        '**/test/**',
        '**/tests/**',
        '**/__tests__/**',
        '**/rollup*.config.*',
        '**/build/**',
        '.eslint*',
        'vite.config.*',
      ],
    },
    reporters: process.env.CI
      ? ['default', 'github-actions', ['junit', { classnameTemplate: '{filepath}' }]]
      : ['default'],
    outputFile: {
      junit: 'vitest.junit.xml',
    },
    typecheck: {
      tsconfig: './tsconfig.test.json',
    },
  },
});
