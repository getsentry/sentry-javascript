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
      },
    );
  });
