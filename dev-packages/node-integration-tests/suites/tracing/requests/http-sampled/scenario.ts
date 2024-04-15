import { loggingTransport } from '@sentry-internal/node-integration-tests';
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  tracePropagationTargets: [/\/v0/, 'v1'],
  integrations: [],
  transport: loggingTransport,
});

import * as http from 'http';

Sentry.startSpan({ name: 'test_span' }, () => {
  http.get(`${process.env.SERVER_URL}/api/v0`);
  http.get(`${process.env.SERVER_URL}/api/v1`);
  http.get(`${process.env.SERVER_URL}/api/v2`);
  http.get(`${process.env.SERVER_URL}/api/v3`);
});
