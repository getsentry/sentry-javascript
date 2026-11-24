import { withSentry } from '@sentry/solidstart/vite';
import { defineConfig } from '@solidjs/start/config';

// The inject mode variants set `E2E_TEST_INJECT_MODE` for the build and the test run.
const injectMode = process.env.E2E_TEST_INJECT_MODE as 'top-level-import' | 'experimental_dynamic-import' | undefined;

// `manual-upload`: Sentry uploads nothing and keeps the maps it turned on, for an upload with the CLI.
// `delete-all`: the app turns source maps on itself, and Sentry removes them.
const variant = process.env.E2E_VARIANT;

export default defineConfig(
  withSentry(
    {
      middleware: './src/middleware.ts',
      ...(variant === 'delete-all' && { vite: { build: { sourcemap: true } } }),
    },
    {
      sentryUrl: 'http://localhost:3032',
      authToken: process.env.E2E_NO_UPLOAD ? undefined : 'fake-auth-token',
      org: 'test-org',
      project: 'test-project',
      release: { name: 'test-release' },
      debug: true,
      autoInjectServerSentry: injectMode,
      sourcemaps:
        variant === 'manual-upload'
          ? { upload: false, delete: false }
          : variant === 'delete-all'
            ? { delete: true }
            : undefined,
    },
  ),
);
