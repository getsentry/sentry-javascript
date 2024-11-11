const { loggingTransport } = require('@sentry-internal/node-integration-tests');
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
  integrations: [Sentry.knexIntegration()],
});

// Stop the process from exiting before the transaction is sent
setInterval(() => {}, 1000);

const knex = require('knex').default;

const pgClient = knex({
  client: 'pg',
  connection: {
    host: 'localhost',
    port: 5445,
    user: 'test',
    password: 'test',
    database: 'tests',
  },
});

async function run() {
  await Sentry.startSpan(
    {
      name: 'Test Transaction',
      op: 'transaction',
    },
    async () => {
      try {
        await pgClient.schema.createTable('User', table => {
          table.increments('id').notNullable().primary({ constraintName: 'User_pkey' });
          table.timestamp('createdAt', { precision: 3 }).notNullable().defaultTo(pgClient.fn.now(3));
          table.text('email').notNullable();
          table.text('name').notNullable();
        });

        await pgClient('User').insert({ name: 'bob', email: 'bob@domain.com' });
        await pgClient('User').select('*');
      } finally {
        await pgClient.destroy();
      }
    },
  );
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
run();
