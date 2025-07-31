import * as Sentry from '@sentry/node';
import { eventLoopBlockIntegration } from '@sentry/node-native';

Sentry.init({
  debug: true,
  dsn: process.env.SENTRY_DSN,
  release: '1.0',
  integrations: [eventLoopBlockIntegration()],
});
