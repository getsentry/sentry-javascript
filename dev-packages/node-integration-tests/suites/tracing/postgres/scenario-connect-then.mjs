import * as Sentry from '@sentry/node';
import { Client } from 'pg';

async function run() {
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
        const client = new Client({ port: 5494, user: 'test', password: 'test', database: 'tests' });
        client
          .connect()
          .then(() => client.query('SELECT 1 AS connect_then'))
          .then(() => client.end())
          .then(resolve, reject);
      }),
  );
}

run();
