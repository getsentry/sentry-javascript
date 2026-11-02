import { withSentry } from '@sentry/solidstart/vite';
import { defineConfig } from '@solidjs/start/config';

export default defineConfig(
  withSentry({
    ssr: false,
    middleware: './src/middleware.ts',
  }),
);
