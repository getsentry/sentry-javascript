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
  autoSessionTracking: false,
});

// eslint-disable-next-line deprecation/deprecation
Sentry.enableAnrDetection({captureStackTrace: true, anrThreshold: 200}).then(() => {
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
});
