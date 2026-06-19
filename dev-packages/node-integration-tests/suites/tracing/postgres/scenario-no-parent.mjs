import * as Sentry from '@sentry/node';
import { Client } from 'pg';

const client = new Client({ port: 5494, user: 'test', password: 'test', database: 'tests' });

async function run() {
  // No active span here: `requireParentSpan` means the connect and this query
  // must NOT produce spans.
  await client.connect();
  await client.query('SELECT 1 AS unparented');

  // With an active span, the query is instrumented as a child span.
  await Sentry.startSpan(
    {
      name: 'Test Transaction',
      op: 'transaction',
    },
    async () => {
      await client.query('SELECT 2 AS parented');
    },
  );

  await client.end();
}

run();
