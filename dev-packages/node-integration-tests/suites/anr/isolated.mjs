import * as assert from 'assert';
import * as crypto from 'crypto';

import * as Sentry from '@sentry/node';

setTimeout(() => {
  process.exit();
}, 10000);

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  release: '1.0',
  autoSessionTracking: false,
  integrations: [Sentry.anrIntegration({ captureStackTrace: true, anrThreshold: 100 })],
});

async function longWork() {
  await new Promise(resolve => setTimeout(resolve, 1000));

  for (let i = 0; i < 20; i++) {
    const salt = crypto.randomBytes(128).toString('base64');
    const hash = crypto.pbkdf2Sync('myPassword', salt, 10000, 512, 'sha512');
    assert.ok(hash);
  }
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
