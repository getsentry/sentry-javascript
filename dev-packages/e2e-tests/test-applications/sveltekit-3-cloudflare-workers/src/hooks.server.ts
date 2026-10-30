import { E2E_TEST_DSN, E2E_TEST_TUNNEL } from '$app/env/private';
import {
  handleErrorWithSentry,
  initCloudflareSentryHandle,
  sentryHandle,
  serveTunnelIntegration,
} from '@sentry/sveltekit';
import { sequence } from '@sveltejs/kit/hooks';

// not logging anything to console to avoid noise in the test output
export const handleError = handleErrorWithSentry(() => {});

export const handle = sequence(
  initCloudflareSentryHandle({
    environment: 'qa', // dynamic sampling bias to keep spans
    dsn: E2E_TEST_DSN,
    debug: !!process.env.DEBUG,
    tunnel: 'http://localhost:3031/', // proxy server
    integrations: E2E_TEST_TUNNEL ? [serveTunnelIntegration()] : [],
    tracesSampleRate: 1.0,
  }),
  sentryHandle(),
);
