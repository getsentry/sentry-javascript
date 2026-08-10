import * as Sentry from '@sentry/solidstart';
import { definePlugin } from 'nitro';

// Runs once at server startup. Build-time instrumentation means no `--import` preload is needed.
export default definePlugin(() => {
  Sentry.init({
    traceLifecycle: 'static',
    dsn: process.env.E2E_TEST_DSN,
    environment: 'qa', // dynamic sampling bias to keep transactions
    tracesSampleRate: 1.0, //  Capture 100% of the transactions
    tunnel: 'http://localhost:3031/', // proxy server
    debug: !!process.env.DEBUG,
  });
});
