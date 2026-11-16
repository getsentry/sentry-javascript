import * as Sentry from '@sentry/nextjs';
import { SENTRY_DSN } from './sentry-dsn';

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: SENTRY_DSN,
  // Serves the managed tunnel of the managed variants
  integrations: process.env.NEXT_PUBLIC_E2E_TEST_TUNNEL_MODE === 'managed' ? [Sentry.serveTunnelIntegration()] : [],
  tracesSampleRate: 1.0,
  // debug: true,
});
