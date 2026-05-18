import * as Sentry from '@sentry/node';
import { Connection, Request } from 'tedious';

const config = {
  server: '127.0.0.1',
  authentication: {
    type: 'default',
    options: {
      userName: 'sa',
      password: 'TESTing123',
    },
  },
  options: {
    port: 1433,
    encrypt: false,
  },
};

const connection = new Connection(config);

function executeAllStatements(span) {
  executeStatement('SELECT 1 + 1 AS solution', () => {
    executeStatement('SELECT GETDATE()', () => {
      span.end();
      connection.close();
    });
  });
}

function executeStatement(query, callback) {
  const request = new Request(query, err => {
    if (err) {
      throw err;
    }
    callback();
  });

  connection.execSql(request);
}

connection.connect(err => {
  if (err) {
    throw err;
  }

  Sentry.startSpanManual(
    {
      op: 'transaction',
      name: 'Test Transaction',
    },
    span => {
      // span must be ended manually after all queries
      executeAllStatements(span);
    },
  );
});
