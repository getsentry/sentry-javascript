import '@sentry/tracing';

import * as Sentry from '@sentry/node';
import pg from 'pg';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
});

Sentry.startSpanManual({ name: 'Test Span' }, span => {
  const client = new pg.Client();
  client.query('SELECT * FROM foo where bar ilike "baz%"', ['a', 'b'], () =>
    client.query('SELECT * FROM bazz', () => {
      client.query('SELECT NOW()', () => span?.end());
    }),
  );
});
