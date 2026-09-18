// `start.instrument`: awaited to completion before anything else in the
// server graph loads, so the Node SDK's OpenTelemetry setup lands before the
// modules it patches.
import * as Sentry from '@sentry/solid-2/server';

Sentry.init({
  dsn: process.env.E2E_TEST_DSN,
  environment: 'qa', // dynamic sampling bias to keep transactions
  tracesSampleRate: 1.0,
  tunnel: 'http://localhost:3031/', // proxy server
  integrations: [Sentry.solidServerTracingIntegration()],
  debug: !!process.env.DEBUG,
});
