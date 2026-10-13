import * as Sentry from '@sentry/node';
import { uuid4 } from '@sentry/core';
import postgres from 'postgres';
import { waitForConnection } from '@sentry-internal/node-integration-tests';

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
        await waitForConnection(() => sql`SELECT 1`);
        await sql`
          CREATE TABLE "User" ("id" SERIAL NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"email" TEXT NOT NULL,"name" TEXT,CONSTRAINT "User_pkey" PRIMARY KEY ("id"));
        `;

        const email = `${uuid4()}@domain.com`;
        await sql`
          INSERT INTO "User" ("email", "name") VALUES (${email}, 'tim');
        `;

        await sql`
          UPDATE "User" SET "name" = 'Foo' WHERE "email" = ${email};
        `;

        await sql`
          SELECT * FROM "User" WHERE "email" = ${email};
        `;

        // Test parameterized queries
        await sql`
          SELECT * FROM "User" WHERE "email" = ${email} AND "name" = ${'Foo'};
        `;

        // Test DELETE operation
        await sql`
          DELETE FROM "User" WHERE "email" = ${email};
        `;

        // Test INSERT with RETURNING
        await sql`
          INSERT INTO "User" ("email", "name") VALUES (${email}, 'Test User') RETURNING *;
        `;

        // Test cursor-based queries
        await sql`SELECT * from generate_series(1,1000) as x `.cursor(10, async rows => {
          await Promise.all(rows);
        });

        // Test multiple rows at once
        await sql`
          SELECT * FROM "User" LIMIT 10;
        `;

        await sql`
          DROP TABLE "User";
        `;

        // This will be captured as an error as the table no longer exists
        await sql`
          SELECT * FROM "User" WHERE "email" = ${email};
        `;
      } finally {
        await sql.end();
      }
    },
  );
}

run();
