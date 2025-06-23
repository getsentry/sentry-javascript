import * as Sentry from '@sentry/node';
import genericPool from 'generic-pool';
import mysql from 'mysql';

// Stop the process from exiting before the transaction is sent
setInterval(() => {}, 1000);

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
        // eslint-disable-next-line no-console
        console.error('Error while disconnecting MySQL:', err);
      }
    });
  },
};

const opts = {
  max: 10,
  min: 2,
};

const myPool = genericPool.createPool(factory, opts);

async function run() {
  await Sentry.startSpan(
    {
      op: 'transaction',
      name: 'Test Transaction',
    },
    async () => {
      try {
        const client1 = await myPool.acquire();
        const client2 = await myPool.acquire();

        client1.query('SELECT NOW()', function () {
          myPool.release(client1);
        });

        client2.query('SELECT 1 + 1 AS solution', function () {
          myPool.release(client2);
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Error while pooling MySQL:', err);
      } finally {
        await myPool.drain();
        await myPool.clear();
      }
    },
  );
}

run();
