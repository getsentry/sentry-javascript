import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tracesSampleRate: 0,
  transport: loggingTransport,
  traceLifecycle: 'stream',
  ignoreSpans: [{ attributes: { 'url.path': '/outgoing' } }],
  tracePropagationTargets: [process.env.SERVER_URL],
  clientReportFlushInterval: 1_000,
});
