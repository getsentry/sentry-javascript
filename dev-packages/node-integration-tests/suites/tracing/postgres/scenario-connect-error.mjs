import * as Sentry from '@sentry/node';
import { Client } from 'pg';

// Nothing is listening on this port, so `connect()` fails and the connect span
// must be recorded with an errored status.
const client = new Client({ port: 5499, user: 'test', password: 'test', database: 'tests' });

async function run() {
  await Sentry.startSpan(
    {
      name: 'Test Transaction',
      op: 'transaction',
    },
    async () => {
      await client.connect().catch(() => {
        // expected: connection refused
      });
    },
  );
}

run();
