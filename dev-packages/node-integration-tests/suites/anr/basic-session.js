const crypto = require('crypto');
const assert = require('assert');

const Sentry = require('@sentry/node');

setTimeout(() => {
  process.exit();
}, 10000);

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  debug: true,
  integrations: [new Sentry.Integrations.Anr({ captureStackTrace: true, anrThreshold: 200 })],
});

function longWork() {
  for (let i = 0; i < 100; i++) {
    const salt = crypto.randomBytes(128).toString('base64');
    // eslint-disable-next-line no-unused-vars
    const hash = crypto.pbkdf2Sync('myPassword', salt, 10000, 512, 'sha512');
    assert.ok(hash);
  }
}

setTimeout(() => {
  longWork();
}, 1000);
