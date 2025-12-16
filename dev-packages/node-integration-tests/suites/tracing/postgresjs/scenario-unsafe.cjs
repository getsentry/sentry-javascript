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
        // Test sql.unsafe() - this was not being instrumented before the fix
        await sql.unsafe('CREATE TABLE "User" ("id" SERIAL NOT NULL, "email" TEXT NOT NULL, PRIMARY KEY ("id"))');

        await sql.unsafe('INSERT INTO "User" ("email") VALUES ($1)', ['test@example.com']);

        await sql.unsafe('SELECT * FROM "User" WHERE "email" = $1', ['test@example.com']);

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
