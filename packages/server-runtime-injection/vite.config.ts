import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import baseConfig from '../../vite/vite.config';

// `register.ts` imports `SENTRY_INSTRUMENTATIONS` from `@sentry/server-utils/orchestrion/config`,
// whose exports map resolves to `@sentry/server-utils`'s emitted `build/`. Alias it to the source so
// the tests run on a clean checkout without `@sentry/server-utils` having been built first.
const orchestrionConfigSource = fileURLToPath(
  new URL('../server-utils/src/orchestrion/config/index.ts', import.meta.url),
);

export default defineConfig({
  ...baseConfig,
  resolve: {
    alias: {
      '@sentry/server-utils/orchestrion/config': orchestrionConfigSource,
    },
  },
  test: {
    ...baseConfig.test,
  },
});
