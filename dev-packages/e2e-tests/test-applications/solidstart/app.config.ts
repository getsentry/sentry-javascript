import { withSentry } from '@sentry/solidstart';
import { defineConfig } from '@solidjs/start/config';

export default defineConfig(
  withSentry({
    middleware: './src/middleware.ts',
  }),
);
