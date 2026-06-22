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
    const query = connection.query('SELECT 1 + 1 AS solution');

    // This should _not_ be the parent of the listener-child!
    Sentry.startSpanManual({ name: 'inner-span' }, innerSpan => {
      query.on('end', () => {
        // A span started from inside a stream listener should be a child of the parent context that was
        // active when the query was issued (the transaction here), not of the query span itself. This
        // verifies the instrumentation re-binds the streamed query's events to the parent context.
        Sentry.startSpan({ name: 'listener-child' }, () => {
          // noop
        });

        // Wait to ensure the query span has been finished
        setTimeout(() => {
          innerSpan.end();
          span.end();
          connection.end();
        }, 1);
      });
    });
  },
);
