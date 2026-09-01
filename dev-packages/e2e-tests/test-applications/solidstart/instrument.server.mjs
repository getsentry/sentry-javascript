// Dev-server counterpart of `src/instrument.server.ts`. `vinxi dev` produces no build output, so
// there is no `.output/server/instrument.server.mjs` to `--import`; this file is loaded directly.
import * as Sentry from '@sentry/solidstart';

Sentry.init({
  traceLifecycle: 'static',
  dsn: process.env.E2E_TEST_DSN,
  environment: 'qa', // dynamic sampling bias to keep transactions
  tracesSampleRate: 1.0, //  Capture 100% of the transactions
  tunnel: 'http://localhost:3031/', // proxy server
  debug: !!process.env.DEBUG,
});
