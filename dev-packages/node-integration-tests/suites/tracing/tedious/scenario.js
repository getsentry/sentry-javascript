const { loggingTransport } = require('@sentry-internal/node-integration-tests');
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
  debug: true,
});

const { Connection, Request } = require('tedious');

const config = {
  server: 'localhost',
  authentication: {
    type: 'default',
    options: {
      userName: 'test',
      password: 'test',
    },
  },
  options: {
    port: 1433, // Default Port
  },
};

const connection = new Connection(config);

function executeStatement() {
  const request = new Request('SELECT GETDATE()', (err, rowCount) => {
    if (err) {
      throw err;
    }

    console.log('DONE!');
    connection.close();
  });

  // Emits a 'DoneInProc' event when completed.
  request.on('row', columns => {
    columns.forEach(column => {
      if (column.value === null) {
        console.log('NULL');
      } else {
        console.log(column.value);
      }
    });
  });

  request.on('done', rowCount => {
    console.log('Done is called!');
  });

  request.on('doneInProc', (rowCount, more) => {
    console.log(rowCount + ' rows returned');
  });

  // In SQL Server 2000 you may need: connection.execSqlBatch(request);
  connection.execSqlBatch(request);
}

Sentry.startSpan(
  {
    op: 'transaction',
    name: 'Test Transaction',
  },
  span => {
    connection.connect(err => {
      if (err) {
        console.log('Connection Failed');
        throw err;
      }

      executeStatement();
      span.end()
    });
  },
);
