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

const mysql2Client = knex({
  client: 'mysql2',
  connection: {
    host: 'localhost',
    port: 3307,
    user: 'root',
    password: 'docker',
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
        await mysql2Client.schema.createTable('User', table => {
          table.increments('id').notNullable().primary({ constraintName: 'User_pkey' });
          table.timestamp('createdAt', { precision: 3 }).notNullable().defaultTo(mysql2Client.fn.now(3));
          table.text('email').notNullable();
          table.text('name').notNullable();
        });

        await mysql2Client('User').insert({ name: 'jane', email: 'jane@domain.com' });
        await mysql2Client('User').select('*');
      } finally {
        await mysql2Client.destroy();
      }
    },
  );
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
run();
