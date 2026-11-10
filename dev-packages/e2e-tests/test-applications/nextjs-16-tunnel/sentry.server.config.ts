import * as Sentry from '@sentry/nextjs';
import { SENTRY_DSN } from './sentry-dsn';

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: SENTRY_DSN,
  // No tunnel option - using tunnelRoute from withSentryConfig
  tracesSampleRate: 1.0,
  // debug: true,
});
