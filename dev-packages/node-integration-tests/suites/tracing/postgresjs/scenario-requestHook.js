const Sentry = require('@sentry/node');
const postgres = require('postgres');

// Stop the process from exiting before the transaction is sent
setInterval(() => {}, 1000);

const sql = postgres({ port: 5444, user: 'test', password: 'test', database: 'test_db' });

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
          SELECT * FROM "User" WHERE "email" = 'bar@baz.com';
        `;

        await sql`
          DROP TABLE "User";
        `;
      } finally {
        await sql.end();
      }
    },
  );
}

run();
