import { loggingTransport } from '@sentry-internal/node-integration-tests';
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
});

import * as http from 'http';

// eslint-disable-next-line @typescript-eslint/no-floating-promises
Sentry.startSpan({ name: 'test_transaction' }, async () => {
  http.get(`${process.env.SERVER_URL}/api/v0`);
  http.get(`${process.env.SERVER_URL}/api/v1`);

  // Give it a tick to resolve...
  await new Promise(resolve => setTimeout(resolve, 100));
});
