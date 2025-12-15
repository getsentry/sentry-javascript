import * as Sentry from '@sentry/node';
import postgres from 'postgres';

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

        // Test parameterized queries
        await sql`
          SELECT * FROM "User" WHERE "email" = ${'bar@baz.com'} AND "name" = ${'Foo'};
        `;

        // Test DELETE operation
        await sql`
          DELETE FROM "User" WHERE "email" = 'bar@baz.com';
        `;

        // Test INSERT with RETURNING
        await sql`
          INSERT INTO "User" ("email", "name") VALUES ('test@example.com', 'Test User') RETURNING *;
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
          SELECT * FROM "User" WHERE "email" = 'foo@baz.com';
        `;
      } finally {
        await sql.end();
      }
    },
  );
}

run();
