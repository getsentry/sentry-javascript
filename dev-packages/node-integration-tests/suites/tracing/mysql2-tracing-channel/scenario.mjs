import * as Sentry from '@sentry/node';
import { waitForConnection } from '@sentry-internal/node-integration-tests';
import mysql from 'mysql2/promise';

const CONNECT_CONFIG = {
  user: 'root',
  password: 'password',
  host: 'localhost',
  port: 3308,
};

async function run() {
  // Yield a microtick so the DC subscriber (deferred via Promise.resolve().then)
  // is registered before mysql2 publishes on its native TracingChannels.
  await Promise.resolve();

  // Gate on the DB actually accepting a connection before opening the span (see `waitForConnection`).
  // MySQL keeps finalizing for a short window after the healthcheck passes and drops early handshakes,
  // so this retries a real connect. It runs outside an active span, so the connect stays uninstrumented.
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
    async () => {
      await connection.query('SELECT 1 + 1 AS solution');
      // A literal value, to assert it is redacted out of `db.query.text`.
      await connection.query("SELECT 'super-secret' AS leaked");
      // `execute` keeps `?` placeholders (prepared statements).
      await connection.execute('SELECT ? AS answer', [42]);
      // A failing query should produce a span with an error status.
      await connection.query('SELECT * FROM does_not_exist').catch(() => {});
    },
  );

  await connection.end();
}

run();
