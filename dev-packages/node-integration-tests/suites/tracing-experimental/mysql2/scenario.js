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

const mysql = require('mysql2/promise');

mysql
  .createConnection({
    user: 'root',
    password: 'password',
    host: 'localhost',
    port: 3306,
  })
  .then(connection => {
    return Sentry.startSpan(
      {
        op: 'transaction',
        name: 'Test Transaction',
      },
      async _ => {
        await connection.query('SELECT 1 + 1 AS solution');
        await connection.query('SELECT NOW()', ['1', '2']);
      },
    );
  });
