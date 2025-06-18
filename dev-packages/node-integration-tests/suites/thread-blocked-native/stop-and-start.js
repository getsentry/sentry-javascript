const Sentry = require('@sentry/node');
const { threadBlockedIntegration } = require('@sentry/node-native');
const { longWork } = require('./long-work.js');
const crypto = require('crypto');
const assert = require('assert');

setTimeout(() => {
  process.exit();
}, 10000);

const threadBlocked = threadBlockedIntegration({ blockedThreshold: 100 });

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  release: '1.0',
  debug: true,
  integrations: [threadBlocked],
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

setTimeout(() => {
  threadBlocked.stopWorker();

  setTimeout(() => {
    longWorkIgnored();

    setTimeout(() => {
      threadBlocked.startWorker();

      setTimeout(() => {
        longWork();
      });
    }, 2000);
  }, 2000);
}, 2000);
