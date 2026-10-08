import * as Sentry from '@sentry/node';
import { waitForConnection } from '@sentry-internal/node-integration-tests';
import { Client, Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;
neonConfig.wsProxy = () => 'localhost:4494/v2';
neonConfig.useSecureWebSocket = false;
neonConfig.pipelineConnect = false;

const connectionString = 'postgres://test:test@db.localtest.me:5432/tests';
const client = new Client(connectionString);

async function run() {
  await waitForConnection(async () => {
    const probe = new Client(connectionString);
    await probe.connect();
    await probe.end();
  });

  await Sentry.startSpan({ name: 'Test Span', op: 'test' }, async () => {
    const pool = new Pool({ connectionString });
    try {
      await client.connect();

      await client.query(
        'CREATE TABLE "User" ("id" SERIAL NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"email" TEXT NOT NULL,"name" TEXT,CONSTRAINT "User_pkey" PRIMARY KEY ("id"))',
      );
      await client.query('INSERT INTO "User" ("email", "name") VALUES ($1, $2)', ['tim@domain.com', 'tim']);
      await client.query('SELECT * FROM "User"');

      await pool.query('SELECT "name" FROM "User"');

      // A failing query should still produce an errored span
      await client.query('SELECT * FROM "does_not_exist_table"').catch(() => {
        // swallow: we only care about the span it produces
      });
    } finally {
      await client.query('DROP TABLE "User"');
      await client.end();
      await pool.end();
    }
  });
}

run();
