import { withSentry } from '@sentry/solidstart/vite';
import { defineConfig } from '@solidjs/start/config';

export default defineConfig(
  withSentry({
    middleware: './src/middleware.ts',
  }),
);
