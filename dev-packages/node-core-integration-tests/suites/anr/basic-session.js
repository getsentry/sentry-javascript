const crypto = require('crypto');
const assert = require('assert');

const Sentry = require('@sentry/node-core');
const { setupOtel } = require('../../utils/setupOtel.js');

setTimeout(() => {
  process.exit();
}, 10000);

const client = Sentry.init({
  dsn: process.env.SENTRY_DSN,
  release: '1.0.0',
  integrations: [Sentry.anrIntegration({ captureStackTrace: true, anrThreshold: 100 })],
});

setupOtel(client);

Sentry.setUser({ email: 'person@home.com' });
Sentry.addBreadcrumb({ message: 'important message!' });

function longWork() {
  for (let i = 0; i < 20; i++) {
    const salt = crypto.randomBytes(128).toString('base64');
    const hash = crypto.pbkdf2Sync('myPassword', salt, 10000, 512, 'sha512');
    assert.ok(hash);
  }
}

setTimeout(() => {
  longWork();
}, 1000);
