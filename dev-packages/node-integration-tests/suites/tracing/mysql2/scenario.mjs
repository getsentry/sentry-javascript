import * as Sentry from '@sentry/node';
import { waitForConnection } from '@sentry-internal/node-integration-tests';
import mysql from 'mysql2/promise';

const CONNECT_CONFIG = {
  user: 'root',
  password: 'password',
  host: 'localhost',
  port: 3306,
};

async function run() {
  // Gate on the DB actually accepting a connection before opening the span (see `waitForConnection`).
  await waitForConnection(async () => {
    const probe = await mysql.createConnection(CONNECT_CONFIG);
    await probe.end();
  });

  const connection = await mysql.createConnection(CONNECT_CONFIG);

  await Sentry.startSpan(
    {
      op: 'transaction',
      name: 'Test Transaction',
    },
    async _ => {
      await connection.query('SELECT 1 + 1 AS solution');
      await connection.query('SELECT ? as a, ? as b, NOW() as c', ['1', '2']);
      await connection.query('SELECT ? AS scalar_value', 42);
      // `execute` is instrumented the same way as `query`
      await connection.execute('SELECT 42 AS answer');
      // a failing query should produce a span with an error status
      await connection.query('SELECT * FROM does_not_exist').catch(() => {});
    },
  );
}

run();
