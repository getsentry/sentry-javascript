import * as Sentry from '@sentry/node';
import { waitForConnection } from '@sentry-internal/node-integration-tests';
import { Client } from 'pg';

const connectionConfig = { port: 5494, user: 'test', password: 'test', database: 'tests' };

async function run() {
  // Gate on the DB actually accepting a connection before opening the span (see `waitForConnection`).
  await waitForConnection(async () => {
    const probe = new Client(connectionConfig);
    await probe.connect();
    await probe.end();
  });

  await Sentry.startSpan(
    {
      name: 'Test Transaction',
      op: 'transaction',
    },
    () =>
      // Chain off `connect()` with `.then()` instead of awaiting it: the query
      // issued from the continuation must still be parented to the active
      // transaction, proving the trace context survives the connect promise.
      new Promise((resolve, reject) => {
        const client = new Client(connectionConfig);
        client
          .connect()
          .then(() => client.query('SELECT 1 AS connect_then'))
          .then(() => client.end())
          .then(resolve, reject);
      }),
  );
}

run();
