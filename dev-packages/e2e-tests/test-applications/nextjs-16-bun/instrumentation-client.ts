import * as Sentry from '@sentry/nextjs';

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: process.env.NEXT_PUBLIC_E2E_TEST_DSN,
  tunnel: `http://localhost:3031/`, // proxy server
  tracesSampleRate: 1.0,
  sendDefaultPii: true,
  integrations: [
    Sentry.thirdPartyErrorFilterIntegration({
      filterKeys: ['nextjs-16-bun-e2e'],
      behaviour: 'apply-tag-if-exclusively-contains-third-party-frames',
    }),
  ],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
