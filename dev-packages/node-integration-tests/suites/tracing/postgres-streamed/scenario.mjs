import * as Sentry from '@sentry/node';
import { Client } from 'pg';

const client = new Client({ port: 5495, user: 'test', password: 'test', database: 'tests' });

async function run() {
  await Sentry.startSpan(
    {
      name: 'Test Span',
      op: 'parent_span',
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

run();
