const { loggingTransport } = require('@sentry-internal/node-integration-tests');
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
});

// Import postgres AFTER Sentry.init() so instrumentation is set up
const postgres = require('postgres');

// Stop the process from exiting before the transaction is sent
setInterval(() => {}, 1000);

// Test URL-based initialization - this is the common pattern that was causing the regression
const sql = postgres('postgres://test:test@localhost:5444/test_db');

async function run() {
  await Sentry.startSpan(
    {
      name: 'Test Transaction',
      op: 'transaction',
    },
    async () => {
      try {
        await sql`
          CREATE TABLE "User" ("id" SERIAL NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"email" TEXT NOT NULL,"name" TEXT,CONSTRAINT "User_pkey" PRIMARY KEY ("id"));
        `;

        await sql`
          INSERT INTO "User" ("email", "name") VALUES ('Foo', 'bar@baz.com');
        `;

        await sql`
          UPDATE "User" SET "name" = 'Foo' WHERE "email" = 'bar@baz.com';
        `;

        await sql`
          SELECT * FROM "User" WHERE "email" = 'bar@baz.com';
        `;

        await sql`SELECT * from generate_series(1,1000) as x `.cursor(10, async rows => {
          await Promise.all(rows);
        });

        await sql`
          DROP TABLE "User";
        `;

        // This will be captured as an error as the table no longer exists
        await sql`
          SELECT * FROM "User" WHERE "email" = 'foo@baz.com';
        `;
      } finally {
        await sql.end();
      }
    },
  );
}

run();
