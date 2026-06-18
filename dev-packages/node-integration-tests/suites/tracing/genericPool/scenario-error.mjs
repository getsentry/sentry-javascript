import * as Sentry from '@sentry/node';
import genericPool from 'generic-pool';

// `create` never resolves, so `acquire` rejects and the span is errored.
const factory = {
  create: function () {
    return new Promise(() => {});
  },
  destroy: function () {
    return Promise.resolve();
  },
};

const myPool = genericPool.createPool(factory, { max: 2, min: 0, acquireTimeoutMillis: 500 });

async function run() {
  await Sentry.startSpan(
    {
      op: 'transaction',
      name: 'Test Transaction',
    },
    async () => {
      await myPool.acquire().catch(() => {});
    },
  );
}

run();
