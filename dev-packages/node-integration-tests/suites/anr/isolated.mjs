import * as assert from 'assert';
import * as crypto from 'crypto';

import * as Sentry from '@sentry/node';

setTimeout(() => {
  process.exit();
}, 10000);

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  debug: true,
  autoSessionTracking: false,
  integrations: [Sentry.anrIntegration({ captureStackTrace: true, anrThreshold: 100 })],
});

function longWork() {
  for (let i = 0; i < 20; i++) {
    const salt = crypto.randomBytes(128).toString('base64');
    const hash = crypto.pbkdf2Sync('myPassword', salt, 10000, 512, 'sha512');
    assert.ok(hash);
  }
}

const fns = [
  () => {},
  () => {},
  () => {},
  () => {},
  () => {},
  () => longWork(), // [5]
  () => {},
  () => {},
  () => {},
  () => {},
];

for (let id = 0; id < 10; id++) {
  Sentry.withIsolationScope(() => {
    Sentry.setUser({ id });

    setTimeout(() => {
      fns[id]();
    }, 1000);
  });
}
