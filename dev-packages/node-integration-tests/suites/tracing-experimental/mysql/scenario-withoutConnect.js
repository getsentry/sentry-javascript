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

const mysql = require('mysql');

const connection = mysql.createConnection({
  user: 'root',
  password: 'docker',
});

Sentry.startSpanManual(
  {
    op: 'transaction',
    name: 'Test Transaction',
  },
  span => {
    connection.query('SELECT 1 + 1 AS solution', function () {
      connection.query('SELECT NOW()', ['1', '2'], () => {
        span.end();
        connection.end();
      });
    });
  },
);
