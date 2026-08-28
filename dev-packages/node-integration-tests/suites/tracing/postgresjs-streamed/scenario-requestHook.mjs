import * as Sentry from '@sentry/node';
import { uuid4 } from '@sentry/core/server';
import postgres from 'postgres';
import { waitForConnection } from '@sentry-internal/node-integration-tests';

const sql = postgres({ port: 5446, user: 'test', password: 'test', database: 'test_db' });

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
