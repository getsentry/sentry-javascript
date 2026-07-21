import * as Sentry from '@sentry/node';
import genericPool from 'generic-pool';

// generic-pool v2 uses the callback-based API: `new Pool(factory)` with `factory.create(callback)`
// and `pool.acquire((err, client) => ...)`.
const Pool = genericPool.Pool;

const pool = new Pool({
  name: 'test',
  create: callback => callback(null, { id: Math.random() }),
  destroy: () => {},
  max: 10,
  min: 2,
});

function acquire() {
  return new Promise((resolve, reject) => {
    pool.acquire((err, client) => {
      if (err) {
        reject(err);
        return;
      }
      pool.release(client);
      resolve();
    });
  });
}

async function run() {
  await Sentry.startSpan(
    {
      op: 'transaction',
      name: 'Test Transaction',
    },
    async () => {
      await acquire();
      await acquire();
    },
  );
}

run();
