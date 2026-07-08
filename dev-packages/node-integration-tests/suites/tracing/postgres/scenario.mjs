import * as Sentry from '@sentry/node';
import { Client } from 'pg';
import { waitForPostgres } from './wait-for-postgres.js';

const connectionConfig = { port: 5494, user: 'test', password: 'test', database: 'tests' };
const client = new Client(connectionConfig);

async function run() {
  await waitForPostgres(connectionConfig);
  await Sentry.startSpan(
    {
      name: 'Test Transaction',
      op: 'transaction',
    },
    async () => {
      try {
        await client.connect();

        await client
          .query(
            'CREATE TABLE "User" ("id" SERIAL NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"email" TEXT NOT NULL,"name" TEXT,CONSTRAINT "User_pkey" PRIMARY KEY ("id"));',
          )
          .catch(() => {
            // if this is not a fresh database, the table might already exist
          });

        await client.query('INSERT INTO "User" ("email", "name") VALUES ($1, $2)', ['tim', 'tim@domain.com']);
        await client.query('SELECT * FROM "User"');

        // A named (prepared) query records its name as the `db.postgresql.plan` attribute
        await client.query({
          name: 'select-user-by-email',
          text: 'SELECT * FROM "User" WHERE "email" = $1',
          values: ['tim'],
        });

        // A failing query should still produce an errored span
        await client.query('SELECT * FROM "does_not_exist_table"').catch(() => {
          // swallow: we only care about the span it produces
        });
      } finally {
        await client.end();
      }
    },
  );
}

run();
