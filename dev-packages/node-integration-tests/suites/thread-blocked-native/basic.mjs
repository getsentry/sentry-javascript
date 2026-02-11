import * as Sentry from '@sentry/node';
import { eventLoopBlockIntegration } from '@sentry/node-native';
import { longWork } from './long-work.js';

global._sentryDebugIds = { [new Error().stack]: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaa' };

setTimeout(() => {
  process.exit();
}, 12000);

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  release: '1.0',
  integrations: [eventLoopBlockIntegration()],
});

setTimeout(() => {
  longWork();
}, 2000);

// Ensure we only send one event even with multiple blocking events
setTimeout(() => {
  longWork();
}, 5000);
