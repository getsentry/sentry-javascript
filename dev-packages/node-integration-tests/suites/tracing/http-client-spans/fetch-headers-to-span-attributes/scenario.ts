import { loggingTransport } from '@sentry-internal/node-integration-tests';
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
  integrations: [
    Sentry.nativeNodeFetchIntegration({
      headersToSpanAttributes: {
        requestHeaders: ['x-test-header'],
        responseHeaders: ['x-powered-by'],
      },
    }),
  ],
});

// eslint-disable-next-line @typescript-eslint/no-floating-promises
Sentry.startSpan({ name: 'test_transaction' }, async () => {
  await fetch(`${process.env.SERVER_URL}/api/v0`, { headers: { 'x-test-header': 'test-value' } });
});
