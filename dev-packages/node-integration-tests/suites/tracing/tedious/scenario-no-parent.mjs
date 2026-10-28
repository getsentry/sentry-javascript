import * as Sentry from '@sentry/node';
import { waitForConnection } from '@sentry-internal/node-integration-tests';
import { Connection, Request } from 'tedious';

function connect() {
  return new Promise((resolve, reject) => {
    const connection = new Connection({
      server: '127.0.0.1',
      authentication: {
        type: 'default',
        options: { userName: 'sa', password: 'TESTing123' },
      },
      options: { port: 1433, encrypt: false },
    });

    connection.on('connect', err => {
      if (err) {
        connection.close();
        reject(err);
      } else {
        resolve(connection);
      }
    });
    connection.connect();
  });
}

function query(connection, sql) {
  return new Promise((resolve, reject) => {
    connection.execSql(new Request(sql, err => (err ? reject(err) : resolve())));
  });
}

async function run() {
  const connection = await waitForConnection(connect);

  await query(connection, 'SELECT 1 AS before_parent');

  const parent = Sentry.startInactiveSpan({ name: 'parent operation' });
  await Sentry.withActiveSpan(parent, () => query(connection, 'SELECT 2 AS inside_parent'));

  await query(connection, 'SELECT 3 AS after_parent');
  connection.close();

  // Flush every query before the parent signals that span collection is complete.
  await Sentry.flush();
  parent.end();
  await Sentry.flush();
}

run();
