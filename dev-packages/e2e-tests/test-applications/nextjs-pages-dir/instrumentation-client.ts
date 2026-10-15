import * as Sentry from '@sentry/nextjs';

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  // The tunnel forwards to the DSN host, so the tunnel variant points it at the event proxy
  dsn: process.env.NEXT_PUBLIC_E2E_TUNNEL ? 'http://public@localhost:3031/1337' : process.env.NEXT_PUBLIC_E2E_TEST_DSN,
  tunnel: process.env.NEXT_PUBLIC_E2E_TUNNEL ? undefined : `http://localhost:3031/`, // proxy server
  tracesSampleRate: 1.0,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
