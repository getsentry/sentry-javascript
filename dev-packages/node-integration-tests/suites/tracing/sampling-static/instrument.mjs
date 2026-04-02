import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampler: ({ inheritOrSampleWith, name }) => {
    if (name === 'GET /health') {
      return inheritOrSampleWith(0);
    }
    return inheritOrSampleWith(1);
  },
  transport: loggingTransport,
  clientReportFlushInterval: 1_000,
});
