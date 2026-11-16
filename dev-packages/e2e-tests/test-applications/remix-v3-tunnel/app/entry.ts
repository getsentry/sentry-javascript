import * as Sentry from '@sentry/remix/v3/client';

Sentry.init({
  dsn: 'http://public@localhost:3031/1337',
  tunnel: true,
  tracesSampleRate: 1,
});
