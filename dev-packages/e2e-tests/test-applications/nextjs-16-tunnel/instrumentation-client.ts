import * as Sentry from '@sentry/nextjs';

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  // The tunnel forwards to the DSN host, which is the event proxy here
  dsn: 'http://public@localhost:3031/1337',
  // No tunnel option - using tunnelRoute from withSentryConfig
  tracesSampleRate: 1.0,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
