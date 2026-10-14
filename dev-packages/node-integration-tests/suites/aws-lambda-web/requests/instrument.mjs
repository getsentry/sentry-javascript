import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@example.com/1',
  tracesSampleRate: process.env.NO_TRACING ? undefined : 1,
  transport: loggingTransport,
});
