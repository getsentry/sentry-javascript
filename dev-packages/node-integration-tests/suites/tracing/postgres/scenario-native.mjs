import * as Sentry from '@sentry/node';
import { uuid4 } from '@sentry/core/server';
import { waitForConnection } from '@sentry-internal/node-integration-tests';
import pg from 'pg';

const { native } = pg;
const { Client } = native;

// `pg-native` uses libpq, which resolves `localhost` to IPv6 (`::1`) first and does not
// fall back to IPv4. Docker Desktop only forwards the mapped port over IPv4, so we connect
// to the IPv4 loopback explicitly to avoid an `ECONNREFUSED` on `::1`.
const connectionConfig = { host: '127.0.0.1', port: 5494, user: 'test', password: 'test', database: 'tests' };
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
          'CREATE TABLE "NativeUser" ("id" SERIAL NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"email" TEXT NOT NULL,"name" TEXT,CONSTRAINT "User_pkey" PRIMARY KEY ("id"));',
        );

        const email = `${uuid4()}@domain.com`;
        await client.query('INSERT INTO "NativeUser" ("email", "name") VALUES ($1, $2)', [email, 'tim']);
        await client.query('SELECT * FROM "NativeUser"');
      } finally {
        await client.query('DROP TABLE "NativeUser"');
        await client.end();
      }
    },
  );
}

run();
