const { loggingTransport } = require('@sentry-internal/node-integration-tests');
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
});

// Stop the process from exiting before the transaction is sent
setInterval(() => {}, 1000);

const mysql = require('mysql');
const genericPool = require('generic-pool');

const factory = {
  create: function () {
    return mysql.createConnection({
      user: 'root',
      password: 'docker',
    });
  },
  destroy: function (client) {
    client.end(err => {
      if (err) {
        console.error('Error while disconnecting MySQL:', err);
      }
    });
  },
};

const opts = {
  max: 10, // maximum size of the pool
  min: 2, // minimum size of the pool
};

const myPool = genericPool.createPool(factory, opts);

// const connection = mysql.createConnection({
//   user: 'root',
//   password: 'docker',
// });

// connection.connect(function (err) {
//   if (err) {
//     return;
//   }
// });

// mysql 2
// mysql
//   .createConnection({
//     user: 'root',
//     password: 'password',
//     host: 'localhost',
//     port: 3306,
//   })
//   .then(connection => {
//     return Sentry.startSpan(
//       {
//         op: 'transaction',
//         name: 'Test Transaction',
//       },
//       async _ => {
//         await connection.query('SELECT 1 + 1 AS solution');
//         await connection.query('SELECT NOW()', ['1', '2']);
//       },
//     );
//   });

Sentry.startSpan(
  {
    op: 'transaction',
    name: 'Test Transaction',
  },
  span => {
    // connection.query('SELECT 1 + 1 AS solution', function () {
    //   connection.query('SELECT NOW()', ['1', '2'], () => {
    //     span.end();
    //     connection.end();
    //   });
    // });
    const resourcePromise = myPool.acquire();
    // span.end();

    resourcePromise
      .then(function (client) {
        client.query('SELECT NOW()', function () {
          span.end();
          // client.query('SELECT 1 + 1 AS solution');

          myPool.release(client);
        });
      })
      .catch(function (err) {
        console.error('Error while pooling MySQL:', err);
      });
  },
);
