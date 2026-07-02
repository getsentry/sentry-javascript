import * as Sentry from '@sentry/node';
import mysql from 'mysql2/promise';

const CONNECT_CONFIG = {
  user: 'root',
  password: 'password',
  host: 'localhost',
  port: 3308,
};

// `docker compose up --wait` gates on the healthcheck, but MySQL keeps finalizing
// for a short window afterwards and drops early handshakes ("server closed the
// connection"). Retry the initial connect so the suite doesn't flake on that window.
// A failed attempt still publishes on mysql2's `connect` channel, so the test asserts
// its envelopes with `.unordered()` to tolerate the transient connect transaction.
async function connectWithRetry(attempts = 15, delayMs = 500) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await mysql.createConnection(CONNECT_CONFIG);
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

async function run() {
  // Yield a microtick so the DC subscriber (deferred via Promise.resolve().then)
  // is registered before mysql2 publishes on its native TracingChannels.
  await Promise.resolve();

  const connection = await connectWithRetry();

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
