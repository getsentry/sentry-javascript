import * as Sentry from '@sentry/nextjs';

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: process.env.NEXT_PUBLIC_E2E_TEST_DSN,
  tunnel: `http://localhost:3031/`, // proxy server
  tracesSampleRate: 1.0,
  sendDefaultPii: true,
  integrations: [
    Sentry.replayIntegration(),
    Sentry.feedbackIntegration({
      colorScheme: 'system',
      autoInject: false,
    }),
  ],
  replaysSessionSampleRate: 1.0,
  replaysOnErrorSampleRate: 1.0,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
