import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  traceLifecycle: 'static',
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
  dataCollection: {
    httpHeaders: {
      request: { deny: ['x-tenant-id'] },
      response: { deny: ['content-length'] },
    },
  },
  integrations: [
    Sentry.nativeNodeFetchIntegration({
      headersToSpanAttributes: {
        requestHeaders: ['x-test-header', 'authorization', 'x-tenant-id'],
        responseHeaders: ['x-powered-by', 'content-length'],
      },
    }),
  ],
});
