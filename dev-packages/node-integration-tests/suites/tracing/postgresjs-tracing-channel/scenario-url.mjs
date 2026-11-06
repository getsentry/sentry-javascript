import * as Sentry from '@sentry/node';
import { uuid4 } from '@sentry/core';
import postgres from 'postgres';
import { waitForConnection } from '@sentry-internal/node-integration-tests';

// Test URL-based initialization - this is the common pattern that was causing the regression
const sql = postgres('postgres://test:test@localhost:5445/test_db');

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
          SELECT * FROM "User" WHERE "email" = ${email};
        `;

        await sql`
          DELETE FROM "User" WHERE "email" = ${email};
        `;
      } finally {
        await sql`
          DROP TABLE "User";
        `;
        await sql.end();
      }
    },
  );
}

run();
