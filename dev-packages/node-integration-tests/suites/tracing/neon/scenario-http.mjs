import * as Sentry from '@sentry/node';
import { waitForConnection } from '@sentry-internal/node-integration-tests';
import { neon, neonConfig } from '@neondatabase/serverless';

neonConfig.fetchEndpoint = 'http://localhost:4494/sql';

// The connection string is never dialed by this process: the drivers only talk to the proxy, which
// connects to Postgres itself. Host and port here are what the spans report as the server.
const sql = neon('postgres://test:test@db.localtest.me:5432/tests');

async function run() {
  await waitForConnection(() => sql`SELECT 1`);

  await Sentry.startSpan({ name: 'Test Span', op: 'test' }, async () => {
    try {
      await sql`CREATE TABLE "User" ("id" SERIAL NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"email" TEXT NOT NULL,"name" TEXT,CONSTRAINT "User_pkey" PRIMARY KEY ("id"))`;

      await sql.query('INSERT INTO "User" ("email", "name") VALUES ($1, $2)', ['tim@domain.com', 'tim']);
      await sql`SELECT * FROM "User" WHERE "name" = ${'tim'}`;

      await sql.transaction([sql`SELECT "email" FROM "User"`, sql`SELECT "name" FROM "User"`]);

      // A failing query should still produce an errored span
      await sql`SELECT * FROM "does_not_exist_table"`.catch(() => {
        // swallow: we only care about the span it produces
      });
    } finally {
      await sql`DROP TABLE "User"`;
    }
  });
}

run();
