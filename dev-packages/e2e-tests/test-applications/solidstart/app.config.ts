import { withSentry } from '@sentry/solidstart/vite';
import { defineConfig } from '@solidjs/start/config';

// The inject mode variants set `E2E_TEST_INJECT_MODE` for the build and the test run.
const injectMode = process.env.E2E_TEST_INJECT_MODE as 'top-level-import' | 'experimental_dynamic-import' | undefined;

export default defineConfig(
  withSentry(
    {
      middleware: './src/middleware.ts',
    },
    {
      sentryUrl: 'http://localhost:3032',
      authToken: 'fake-auth-token',
      org: 'test-org',
      project: 'test-project',
      release: { name: 'test-release' },
      debug: true,
      autoInjectServerSentry: injectMode,
    },
  ),
);
