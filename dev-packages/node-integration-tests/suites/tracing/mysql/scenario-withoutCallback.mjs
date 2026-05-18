import * as Sentry from '@sentry/node';
import mysql from 'mysql';

const connection = mysql.createConnection({
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
    const query = connection.query('SELECT 1 + 1 AS solution');
    const query2 = connection.query('SELECT NOW()', ['1', '2']);

    query.on('end', () => {
      query2.on('end', () => {
        // Wait a bit to ensure the queries completed
        setTimeout(() => {
          span.end();
        }, 500);
      });
    });
  },
);
