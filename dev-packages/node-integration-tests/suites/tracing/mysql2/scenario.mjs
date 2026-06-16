import * as Sentry from '@sentry/node';
import mysql from 'mysql2/promise';

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
        // `execute` is instrumented the same way as `query`
        await connection.execute('SELECT 42 AS answer');
        // a failing query should produce a span with an error status
        await connection.query('SELECT * FROM does_not_exist').catch(() => {});
      },
    );
  });
