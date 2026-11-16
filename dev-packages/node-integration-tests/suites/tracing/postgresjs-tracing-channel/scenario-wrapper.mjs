import * as Sentry from '@sentry/node';
import postgres from 'postgres';
import { waitForConnection } from '@sentry-internal/node-integration-tests';

const sql = Sentry.instrumentPostgresJsSql(
  postgres({ port: 5445, user: 'test', password: 'test', database: 'test_db' }),
);

async function run() {
  await waitForConnection(() => sql`SELECT 1`);

  await Sentry.startSpan(
    {
      name: 'Test Transaction',
      op: 'transaction',
    },
    async () => {
      try {
        await sql`SELECT 1 AS one`;
        await sql.unsafe('SELECT 2 AS two');
      } finally {
        await sql.end();
      }
    },
  );
}

run();
