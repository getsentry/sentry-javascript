import * as http from 'http';
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  integrations: [Sentry.httpIntegration({})],
  debug: true,
});

// eslint-disable-next-line @typescript-eslint/no-floating-promises
Sentry.startSpan({ name: 'test_transaction' }, async () => {
  http.get('http://match-this-url.com/api/v0');
  http.get('http://match-this-url.com/api/v1');

  // Give it a tick to resolve...
  await new Promise(resolve => setTimeout(resolve, 100));
});
