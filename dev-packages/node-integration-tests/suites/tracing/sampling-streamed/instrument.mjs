import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampler: ({ inheritOrSampleWith, attributes }) => {
    // The span name is low cardinality with span streaming, so match on `url.path` instead.
    if (attributes?.['url.path'] === '/health') {
      return inheritOrSampleWith(0);
    }
    return inheritOrSampleWith(1);
  },
  transport: loggingTransport,
  traceLifecycle: 'stream',
  clientReportFlushInterval: 1_000,
});
