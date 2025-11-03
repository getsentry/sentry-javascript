import * as Sentry from '@sentry/nextjs';

Sentry.init({
  environment: 'qa',
  dsn: process.env.NEXT_PUBLIC_E2E_TEST_DSN,
  tunnel: `http://localhost:3031/`,
  tracesSampleRate: 1.0,
  sendDefaultPii: true,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
