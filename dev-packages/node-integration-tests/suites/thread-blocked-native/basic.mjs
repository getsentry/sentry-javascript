import * as Sentry from '@sentry/node';
import { eventLoopBlockIntegration } from '@sentry/node-native';
import { longWork } from './long-work.js';

global._sentryDebugIds = { [new Error().stack]: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaa' };

setTimeout(() => {
  process.exit();
}, 12000);

Sentry.init({
  traceLifecycle: 'static',
  dsn: process.env.SENTRY_DSN,
  release: '1.0',
  integrations: [eventLoopBlockIntegration()],
});

// Sentry.addBreadcrumb() writes to the isolation scope which is only captured via
// AsyncLocalStorage, so we add to the current scope to test the poll state route
Sentry.getCurrentScope().addBreadcrumb({
  category: 'test',
  message: 'blocking event loop soon',
  level: 'info',
});

setTimeout(() => {
  longWork();
}, 2000);

// Ensure we only send one event even with multiple blocking events
setTimeout(() => {
  longWork();
}, 5000);
