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

const knex = require('knex').default;

async function run() {
  await Sentry.startSpan(
    {
      name: 'Test Transaction',
      op: 'transaction',
    },
    async () => {
      try {
        const pgKnex = knex({
          client: 'pg',
          connection: {
            host: 'localhost',
            port: 5445,
            user: 'test',
            password: 'test',
            database: 'tests',
          },
        });

        await pgKnex.schema.createTable('User', table => {
          table.increments('id').notNullable().primary({ constraintName: 'User_pkey' });
          table.timestamp('createdAt', { precision: 3 }).notNullable().defaultTo(pgKnex.fn.now(3));
          table.text('email').notNullable();
          table.text('name').notNullable();
        });

        await pgKnex('User').insert({ name: 'bob', email: 'bob@domain.com' });
        await pgKnex('User').select('*');
        // await client
        //   .query(
        //     'CREATE TABLE "User" ("id" SERIAL NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"email" TEXT NOT NULL,"name" TEXT,CONSTRAINT "User_pkey" PRIMARY KEY ("id"));',
        //   )
        //   .catch(() => {
        //     // if this is not a fresh database, the table might already exist
        //   });

        // await client.query('');
        // await client.query('INSERT INTO "User" ("email", "name") VALUES ($1, $2)', ['tim', 'tim@domain.com']);
        // await client.query('SELECT * FROM "User"');
      } finally {
        // await client.end();
      }
    },
  );
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
run();
