import * as Sentry from '@sentry/node';
import pg from 'pg';

const { native } = pg;
const { Client } = native;

// `pg-native` uses libpq, which resolves `localhost` to IPv6 (`::1`) first and does not
// fall back to IPv4. Docker Desktop only forwards the mapped port over IPv4, so we connect
// to the IPv4 loopback explicitly to avoid an `ECONNREFUSED` on `::1`.
const client = new Client({ host: '127.0.0.1', port: 5495, user: 'test', password: 'test', database: 'tests' });

async function run() {
  await Sentry.startSpan(
    {
      name: 'Test Span',
      op: 'parent_span',
    },
    async () => {
      try {
        await client.connect();

        await client
          .query(
            'CREATE TABLE "NativeUser" ("id" SERIAL NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"email" TEXT NOT NULL,"name" TEXT,CONSTRAINT "User_pkey" PRIMARY KEY ("id"));',
          )
          .catch(() => {
            // if this is not a fresh database, the table might already exist
          });

        await client.query('INSERT INTO "NativeUser" ("email", "name") VALUES ($1, $2)', ['tim', 'tim@domain.com']);
        await client.query('SELECT * FROM "NativeUser"');
      } finally {
        await client.end();
      }
    },
  );
}

run();
