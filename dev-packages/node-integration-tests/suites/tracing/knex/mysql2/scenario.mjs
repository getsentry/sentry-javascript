import * as Sentry from '@sentry/node';
import { waitForConnection } from '@sentry-internal/node-integration-tests';
import knex from 'knex';
import mysql from 'mysql2/promise';

const CONNECTION = {
  host: 'localhost',
  port: 3307,
  user: 'root',
  password: 'docker',
  database: 'tests',
};

const mysql2Client = knex({
  client: 'mysql2',
  connection: CONNECTION,
});

async function run() {
  // Gate on the DB actually accepting a connection before opening the span (see `waitForConnection`).
  // knex connects lazily on first query, so probe with a throwaway mysql2 connection (its own driver).
  await waitForConnection(async () => {
    const probe = await mysql.createConnection(CONNECTION);
    await probe.end();
  });

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

run();
