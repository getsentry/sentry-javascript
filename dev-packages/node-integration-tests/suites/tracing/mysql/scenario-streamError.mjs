import * as Sentry from '@sentry/node';
import mysql from 'mysql';

const connection = mysql.createConnection({
  port: Number(process.env.MYSQL_PORT),
  user: 'root',
  password: 'docker',
});

connection.connect(function (err) {
  if (err) {
    return;
  }
});

Sentry.startSpanManual(
  {
    op: 'transaction',
    name: 'Test Transaction',
  },
  span => {
    // Query without a callback returns a streamable `Query`. A failing query emits an `error` event
    // (which sets the span status) followed by `end` (which ends the span).
    const query = connection.query('SELECT * FROM does_not_exist');

    // Swallow the error so it doesn't crash the process
    query.on('error', () => {
      // noop
    });

    query.on('end', () => {
      // Wait a bit to ensure the query span has been finished
      setTimeout(() => {
        span.end();
        connection.end();
      }, 1);
    });
  },
);
