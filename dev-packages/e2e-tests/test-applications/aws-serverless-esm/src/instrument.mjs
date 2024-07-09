import * as Sentry from '@sentry/aws-serverless';

Sentry.init({
  dsn: 'http://public@localhost:3031/1337',
  tracesSampleRate: 1.0,
  debug: true,
});
