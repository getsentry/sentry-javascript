import { withSentry } from '@sentry/solidstart';
import { defineConfig } from '@solidjs/start/config';

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
    },
  ),
);
