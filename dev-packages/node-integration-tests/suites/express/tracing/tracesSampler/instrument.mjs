import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
  tracesSampler: samplingContext => {
    // The name we get here is inferred at span creation time. At this point, we sadly do not have a
    // http.route attribute yet, and with span streaming the name is just the request method, so we
    // match on the unparameterized URL path attribute instead.
    return (
      samplingContext.name === 'GET' &&
      samplingContext.attributes['url.path'] === '/test/123' &&
      samplingContext.attributes['sentry.op'] === 'http.server' &&
      samplingContext.attributes['http.request.method'] === 'GET'
    );
  },
});
