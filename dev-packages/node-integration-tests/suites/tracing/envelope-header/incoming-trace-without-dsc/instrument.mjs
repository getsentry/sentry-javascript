import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@o123.ingest.sentry.io/1337',
  release: '1.0',
  environment: 'prod',
  tracesSampleRate: Number(process.env.TRACES_SAMPLE_RATE),
  traceLifecycle: process.env.TRACE_LIFECYCLE === 'static' ? 'static' : 'stream',
  transport: loggingTransport,
});
