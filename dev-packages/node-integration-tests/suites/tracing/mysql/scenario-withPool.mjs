import * as Sentry from '@sentry/node';
import mysql from 'mysql';

const pool = mysql.createPool({
  port: Number(process.env.MYSQL_PORT),
  user: 'root',
  password: 'docker',
});

Sentry.startSpanManual(
  {
    op: 'transaction',
    name: 'Test Transaction',
  },
  span => {
    pool.query('SELECT 1 + 1 AS solution', function () {
      pool.query('SELECT NOW()', ['1', '2'], () => {
        span.end();
        pool.end();
      });
    });
  },
);
