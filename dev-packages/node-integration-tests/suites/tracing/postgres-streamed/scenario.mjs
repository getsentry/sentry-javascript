import * as Sentry from '@sentry/node';
import { uuid4 } from '@sentry/core/server';
import { waitForConnection } from '@sentry-internal/node-integration-tests';
import { Client } from 'pg';

const connectionConfig = { port: 5495, user: 'test', password: 'test', database: 'tests' };
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
      name: 'Test Span',
      op: 'parent_span',
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
      } finally {
        await client.query('DROP TABLE "User"');
        await client.end();
      }
    },
  );
}

run();
