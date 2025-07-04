const crypto = require('crypto');
const assert = require('assert');

const Sentry = require('@sentry/node-core');
const { setupOtel } = require('../../utils/setupOtel.js');

setTimeout(() => {
  process.exit();
}, 20000);

const anr = Sentry.anrIntegration({ captureStackTrace: true, anrThreshold: 100 });

const client = Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  debug: true,
  integrations: [anr],
});

setupOtel(client);

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
