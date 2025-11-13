import * as Sentry from '@sentry/nextjs';

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: 'https://username@domain/123',
  tunnel: `http://localhost:3031/`, // proxy server
  tracesSampleRate: 1.0,
  sendDefaultPii: true,
  debug: true,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
