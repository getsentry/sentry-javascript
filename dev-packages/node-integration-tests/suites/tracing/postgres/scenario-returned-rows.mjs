import * as Sentry from '@sentry/node';
import { waitForConnection } from '@sentry-internal/node-integration-tests';
import pg from 'pg';

const { Client, Query } = pg;

const connectionConfig = { port: 5494, user: 'test', password: 'test', database: 'tests' };
const client = new Client(connectionConfig);

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
    async () => {
      try {
        await client.connect();

        await client.query('SELECT * FROM generate_series(1, 3) AS single');

        // A multi-statement query resolves to one result per statement
        await client.query('SELECT 1 AS one; SELECT * FROM generate_series(1, 2) AS multi');

        await new Promise((resolve, reject) => {
          client.query('SELECT * FROM generate_series(1, 4) AS callback', (err, res) =>
            err ? reject(err) : resolve(res),
          );
        });

        // A streamed `Submittable` reports its result on `'end'` instead of resolving it
        await new Promise((resolve, reject) => {
          const query = client.query(new Query('SELECT * FROM generate_series(1, 5) AS streamed'));
          query.on('end', resolve);
          query.on('error', reject);
        });
      } finally {
        await client.end();
      }
    },
  );
}

run();
