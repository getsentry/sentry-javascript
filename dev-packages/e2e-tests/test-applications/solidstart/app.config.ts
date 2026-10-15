import { withSentry } from '@sentry/solidstart';
import { defineConfig } from '@solidjs/start/config';

export default defineConfig(
  withSentry({
    middleware: './src/middleware.ts',
    vite: {
      define: {
        __E2E_TEST_TUNNEL__: JSON.stringify(!!process.env.E2E_TEST_TUNNEL),
      },
    },
  }),
);
