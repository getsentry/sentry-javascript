const crypto = require('crypto');
const assert = require('assert');

const Sentry = require('@sentry/node');

setTimeout(() => {
  process.exit();
}, 10000);

const anr = Sentry.anrIntegration({ captureStackTrace: true, anrThreshold: 100 });

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  debug: true,
  autoSessionTracking: false,
  integrations: [anr],
});

Sentry.setUser({ email: 'person@home.com' });
Sentry.addBreadcrumb({ message: 'important message!' });

function longWorkIgnored() {
  for (let i = 0; i < 20; i++) {
    const salt = crypto.randomBytes(128).toString('base64');
    const hash = crypto.pbkdf2Sync('myPassword', salt, 10000, 512, 'sha512');
    assert.ok(hash);
  }
}

function longWork() {
  for (let i = 0; i < 20; i++) {
    const salt = crypto.randomBytes(128).toString('base64');
    const hash = crypto.pbkdf2Sync('myPassword', salt, 10000, 512, 'sha512');
    assert.ok(hash);
  }
}

setTimeout(() => {
  anr.stopWorker();

  setTimeout(() => {
    longWorkIgnored();

    setTimeout(() => {
      anr.startWorker();

      setTimeout(() => {
        longWork();
      });
    }, 2000);
  }, 2000);
}, 2000);
