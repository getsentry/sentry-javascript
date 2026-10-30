import * as Sentry from '@sentry/nextjs';
import { SENTRY_DSN } from './sentry-dsn';

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: SENTRY_DSN,
  // The other variants use the tunnelRoute of withSentryConfig
  tunnel: process.env.NEXT_PUBLIC_E2E_TEST_TUNNEL_MODE === 'managed' ? true : undefined,
  tracesSampleRate: 1.0,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
