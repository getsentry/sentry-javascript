import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  traceLifecycle: 'static',
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
  tracesSampler: samplingContext => {
    // The sampling decision is based on whether the data in `normalizedRequest` is available --> this is what we want to test for
    return (
      samplingContext.normalizedRequest.url.includes('/test-normalized-request?query=123') &&
      samplingContext.normalizedRequest.method &&
      samplingContext.normalizedRequest.query_string === 'query=123' &&
      !!samplingContext.normalizedRequest.headers
    );
  },
});
