import * as Sentry from '@sentry/node';
import { eventLoopBlockIntegration } from '@sentry/node-native';
import * as assert from 'assert';
import * as crypto from 'crypto';

setTimeout(() => {
  process.exit();
}, 10000);

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  release: '1.0',
  integrations: [eventLoopBlockIntegration()],
});

function longWork() {
  // This loop will run almost indefinitely
  for (let i = 0; i < 2000000000; i++) {
    const salt = crypto.randomBytes(128).toString('base64');
    const hash = crypto.pbkdf2Sync('myPassword', salt, 10000, 512, 'sha512');
    assert.ok(hash);
  }
}

setTimeout(() => {
  longWork();
}, 1000);
