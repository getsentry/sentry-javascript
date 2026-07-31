import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

// `TRACES_SAMPLE_RATE` is set per-runner via `.withEnv()`. When it is not set at all, we deliberately
// leave `tracesSampleRate` unset so the SDK runs in "Tracing without Performance" (TwP) mode.
const tracesSampleRate = process.env.TRACES_SAMPLE_RATE;

Sentry.init({
  traceLifecycle: 'static',
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  ...(tracesSampleRate !== undefined ? { tracesSampleRate: Number(tracesSampleRate) } : {}),
  integrations: [],
  transport: loggingTransport,
});
