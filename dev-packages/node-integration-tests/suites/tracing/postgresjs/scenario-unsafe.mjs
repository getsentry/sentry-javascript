import * as Sentry from '@sentry/node';
import postgres from 'postgres';
import { waitForConnection } from '@sentry-internal/node-integration-tests';

// Test with plain object options
const sql = postgres({ port: 5444, user: 'test', password: 'test', database: 'test_db' });

async function run() {
  await Sentry.startSpan(
    {
      name: 'Test Transaction',
      op: 'transaction',
    },
    async () => {
      try {
        await waitForConnection(() => sql`SELECT 1`);
        // Test sql.unsafe() - this was not being instrumented before the fix
        await sql.unsafe('CREATE TABLE "User" ("id" SERIAL NOT NULL, "email" TEXT NOT NULL, PRIMARY KEY ("id"))');

        const email = `${crypto.randomUUID()}@domain.com`;
        await sql.unsafe('INSERT INTO "User" ("email") VALUES ($1)', [email]);

        await sql.unsafe('SELECT * FROM "User" WHERE "email" = $1', [email]);

        await sql.unsafe('DROP TABLE "User"');

        // This will be captured as an error as the table no longer exists
        await sql.unsafe('SELECT * FROM "User"');
      } finally {
        await sql.end();
      }
    },
  );
}

run();
