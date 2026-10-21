import * as Sentry from '@sentry/tanstackstart-react';

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: __APP_DSN__,
  tracesSampleRate: 1.0,
  release: 'e2e-test',
  tunnel: __APP_TUNNEL__,
});
