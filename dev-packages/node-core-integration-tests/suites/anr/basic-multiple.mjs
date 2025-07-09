import * as Sentry from '@sentry/node-core';
import * as assert from 'assert';
import * as crypto from 'crypto';
import { setupOtel } from '../../utils/setupOtel.js';

global._sentryDebugIds = { [new Error().stack]: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaa' };

setTimeout(() => {
  process.exit();
}, 10000);

const client = Sentry.init({
  dsn: process.env.SENTRY_DSN,
  release: '1.0',
  integrations: [Sentry.anrIntegration({ captureStackTrace: true, anrThreshold: 100, maxAnrEvents: 2 })],
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

setTimeout(() => {
  longWork();
}, 4000);
