import { withSentry } from '@sentry/solidstart/vite';
import { defineConfig } from '@solidjs/start/config';

export default defineConfig(
  withSentry(
    {
      middleware: './src/middleware.ts',
      // The base-path variant serves the app, and so the tunnel, under `/app`.
      ...(process.env.E2E_TEST_BASE_PATH && { server: { baseURL: `${process.env.E2E_TEST_BASE_PATH}/` } }),
      vite: {
        define: {
          __E2E_TEST_TUNNEL__: JSON.stringify(!!process.env.E2E_TEST_TUNNEL),
        },
      },
    },
    {
      sentryUrl: 'http://localhost:3032',
      authToken: 'fake-auth-token',
      org: 'test-org',
      project: 'test-project',
      release: { name: 'test-release' },
      debug: true,
    },
  ),
);
