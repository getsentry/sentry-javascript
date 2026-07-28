import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  traceLifecycle: 'static',
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
  tracesSampler: samplingContext => {
    // The name we get here is inferred at span creation time
    // At this point, we sadly do not have a http.route attribute yet,
    // so we infer the name from the unparameterized route instead
    return (
      samplingContext.name === 'GET /test/123' &&
      samplingContext.attributes['sentry.op'] === 'http.server' &&
      samplingContext.attributes['http.method'] === 'GET'
    );
  },
});
