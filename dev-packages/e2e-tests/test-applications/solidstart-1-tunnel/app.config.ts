import { withSentry } from '@sentry/solidstart/vite';
import { defineConfig } from '@solidjs/start/config';

export default defineConfig(
  withSentry(
    { middleware: './src/middleware.ts', server: { baseURL: '/app/' } },
    // `vinxi dev` builds nothing, so the dev server loads this same file with `--import`.
    { instrumentation: './instrument.server.mjs' },
  ),
);
