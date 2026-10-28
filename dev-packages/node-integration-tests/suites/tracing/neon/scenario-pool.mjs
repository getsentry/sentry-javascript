import * as Sentry from '@sentry/node';
import { waitForConnection } from '@sentry-internal/node-integration-tests';
import { Client, Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;
neonConfig.wsProxy = () => 'localhost:4494/v2';
neonConfig.useSecureWebSocket = false;
neonConfig.pipelineConnect = false;

// The connection string is never dialed by this process: the drivers only talk to the proxy, which
// connects to Postgres itself. Host and port here are what the spans report as the server.
const connectionString = 'postgres://test:test@db.localtest.me:5432/tests';

async function run() {
  await waitForConnection(async () => {
    const probe = new Client(connectionString);
    await probe.connect();
    await probe.end();
  });

  const pool = new Pool({ connectionString });
  await Sentry.startSpan({ name: 'Test Span', op: 'test' }, async () => {
    try {
      await pool.query('SELECT "email", "name" FROM pg_catalog.pg_user LIMIT 1').catch(() => {
        // swallow: pg_user has no "email" column, the span is what matters
      });
      await pool.query('SELECT "usename" FROM pg_catalog.pg_user');
    } finally {
      await pool.end();
    }
  });
}

run();
