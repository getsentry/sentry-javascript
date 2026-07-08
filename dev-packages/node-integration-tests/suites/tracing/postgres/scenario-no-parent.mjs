import * as Sentry from '@sentry/node';
import { Client } from 'pg';
import { waitForPostgres } from './wait-for-postgres.js';

const connectionConfig = { port: 5494, user: 'test', password: 'test', database: 'tests' };
const client = new Client(connectionConfig);

async function run() {
  await waitForPostgres(connectionConfig);

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
