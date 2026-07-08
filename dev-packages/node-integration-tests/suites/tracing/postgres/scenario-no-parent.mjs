import * as Sentry from '@sentry/node';
import { waitForConnection } from '@sentry-internal/node-integration-tests';
import { Client } from 'pg';

const connectionConfig = { port: 5494, user: 'test', password: 'test', database: 'tests' };
const client = new Client(connectionConfig);

async function run() {
  // Gate on the DB actually accepting a connection before the scenario runs (see `waitForConnection`).
  await waitForConnection(async () => {
    const probe = new Client(connectionConfig);
    await probe.connect();
    await probe.end();
  });

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
