const { loggingTransport } = require('@sentry-internal/node-integration-tests');
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
});

// Stop the process from exiting before the transaction is sent
setInterval(() => {}, 1000);

const { Client } = require('pg');

const client = new Client({ port: 5444, user: 'test', password: 'test', database: 'tests' });

async function run() {
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
      } finally {
        await client.end();
      }
    },
  );
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
run();
