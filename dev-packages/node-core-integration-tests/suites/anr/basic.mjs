import * as Sentry from '@sentry/node-core';
import { setupOtel } from '../../utils/setupOtel.js';
import { waitForDebuggerReady } from '@sentry-internal/test-utils';

global._sentryDebugIds = { [new Error().stack]: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaa' };

setTimeout(() => {
  process.exit();
}, 10000);

const client = Sentry.init({
  dsn: process.env.SENTRY_DSN,
  release: '1.0',
  integrations: [Sentry.anrIntegration({ captureStackTrace: true, anrThreshold: 100 })],
});

setupOtel(client);

Sentry.setUser({ email: 'person@home.com' });
Sentry.addBreadcrumb({ message: 'important message!' });

function longWork() {
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

waitForDebuggerReady(() => {
  longWork();

  // Ensure we only send one event even with multiple blocking events
  setTimeout(() => {
    longWork();
  }, 2000);
});
