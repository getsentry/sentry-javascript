import * as Sentry from '@sentry/node';
import { disableBlockDetectionForCallback, eventLoopBlockIntegration } from '@sentry/node-native';
import { longWork, longWorkOther } from './long-work.js';

global._sentryDebugIds = { [new Error().stack]: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaa' };

setTimeout(() => {
  process.exit();
}, 15000);

Sentry.init({
  debug: true,
  dsn: process.env.SENTRY_DSN,
  release: '1.0',
  integrations: [eventLoopBlockIntegration()],
});

setTimeout(() => {
  disableBlockDetectionForCallback(() => {
    // This wont be captured
    longWork();
  });

  setTimeout(() => {
    // But this will be captured
    longWorkOther();
  }, 2000);
}, 2000);
