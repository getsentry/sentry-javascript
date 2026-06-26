import * as Sentry from '@sentry/node';
import mysql from 'mysql2/promise';

async function run() {
  // Yield a microtick so the DC subscriber (deferred via Promise.resolve().then)
  // is registered before mysql2 publishes on its native TracingChannels.
  await Promise.resolve();

  const connection = await mysql.createConnection({
    user: 'root',
    password: 'password',
    host: 'localhost',
    port: 3308,
  });

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
