import * as Sentry from '@sentry/node';
import { longWork } from './long-work.js';

setTimeout(() => {
  process.exit();
}, 10000);

function neverResolve() {
  return new Promise(() => {
    //
  });
}

const fns = [
  neverResolve,
  neverResolve,
  neverResolve,
  neverResolve,
  neverResolve,
  longWork, // [5]
  neverResolve,
  neverResolve,
  neverResolve,
  neverResolve,
];

setTimeout(() => {
  for (let id = 0; id < 10; id++) {
    Sentry.withIsolationScope(async () => {
      // eslint-disable-next-line no-console
      console.log(`Starting task ${id}`);
      Sentry.setUser({ id });

      await fns[id]();
    });
  }
}, 1000);
