import * as Sentry from '@sentry/node';
import { eventLoopBlockIntegration } from '@sentry/node-native';
import { longWork } from './long-work.js';

global._sentryDebugIds = { [new Error().stack]: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaa' };

setTimeout(() => {
  process.exit();
}, 10000);

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  release: '1.0',
  integrations: [eventLoopBlockIntegration({ maxEventsPerHour: 2 })],
});

setTimeout(() => {
  longWork();
}, 1000);

setTimeout(() => {
  longWork();
}, 4000);
