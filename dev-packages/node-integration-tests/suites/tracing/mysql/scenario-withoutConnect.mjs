import * as Sentry from '@sentry/node';
import mysql from 'mysql';

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
