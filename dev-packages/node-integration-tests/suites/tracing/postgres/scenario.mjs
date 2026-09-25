import * as Sentry from '@sentry/node';
import { uuid4 } from '@sentry/core';
import { waitForConnection } from '@sentry-internal/node-integration-tests';
import { Client } from 'pg';

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

        await client.query(
          'CREATE TABLE "User" ("id" SERIAL NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"email" TEXT NOT NULL,"name" TEXT,CONSTRAINT "User_pkey" PRIMARY KEY ("id"));',
        );

        const email = `${uuid4()}@domain.com`;
        await client.query('INSERT INTO "User" ("email", "name") VALUES ($1, $2)', [email, 'tim']);
        await client.query('SELECT * FROM "User"');

        // A named (prepared) query records its name as the `db.postgresql.plan` attribute
        await client.query({
          name: 'select-user-by-email',
          text: 'SELECT * FROM "User" WHERE "email" = $1',
          values: [email],
        });

        // A failing query should still produce an errored span
        await client.query('SELECT * FROM "does_not_exist_table"').catch(() => {
          // swallow: we only care about the span it produces
        });
      } finally {
        await client.query('DROP TABLE "User"');
        await client.end();
      }
    },
  );
}

run();
