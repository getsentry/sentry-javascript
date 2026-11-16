import * as Sentry from '@sentry/tanstackstart-react';

Sentry.init({
  dsn: 'http://public@localhost:3031/1337',
  tracesSampleRate: 1,
});
