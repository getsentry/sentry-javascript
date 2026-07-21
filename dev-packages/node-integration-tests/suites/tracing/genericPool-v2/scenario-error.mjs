import * as Sentry from '@sentry/node';
import genericPool from 'generic-pool';

// v2 uses the callback API; a `create` error reaches the `acquire` callback and the span is errored.
const Pool = genericPool.Pool;

const pool = new Pool({
  name: 'test',
  create: callback => callback(new Error('Cannot create resource')),
  destroy: () => {},
  max: 10,
  min: 0,
});

function acquire() {
  return new Promise(resolve => {
    pool.acquire(() => resolve());
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
    },
  );
}

run();
