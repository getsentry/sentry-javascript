import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@localhost/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
});
