import * as Sentry from '@sentry/node-core';
import { setupOtel } from '../../utils/setupOtel.js';

setTimeout(() => {
  process.exit();
}, 10000);

const client = Sentry.init({
  dsn: process.env.SENTRY_DSN,
  release: '1.0',
  integrations: [Sentry.anrIntegration({ captureStackTrace: true, anrThreshold: 100 })],
});

setupOtel(client);

async function longWork() {
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Busy-block the event loop with pure-JS work. The ANR worker samples the main thread via the
  // inspector, which can only pause at a JS safepoint; inside a native call like `crypto.pbkdf2Sync`
  // the pause resolves only after the call returns, so the sample can miss `longWork` and land in
  // timer internals instead. Pure-JS work keeps `longWork` on the sampled stack for the whole block.
  const start = Date.now();
  let n = 1;
  while (Date.now() - start < 1000) {
    n = (n * 1103515245 + 12345) % 2147483648;
  }
  return n;
}

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

for (let id = 0; id < 10; id++) {
  Sentry.withIsolationScope(async () => {
    Sentry.setUser({ id });

    await fns[id]();
  });
}
