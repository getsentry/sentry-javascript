import { E2E_TEST_DSN } from '$app/env/private';
import { handleErrorWithSentry, initCloudflareSentryHandle, sentryHandle } from '@sentry/sveltekit';
import { sequence } from '@sveltejs/kit/hooks';

// not logging anything to console to avoid noise in the test output
export const handleError = handleErrorWithSentry(() => {});

export const handle = sequence(
  initCloudflareSentryHandle({
    traceLifecycle: 'static',
    environment: 'qa', // dynamic sampling bias to keep transactions
    dsn: E2E_TEST_DSN,
    debug: !!process.env.DEBUG,
    tunnel: 'http://localhost:3031/', // proxy server
    tracesSampleRate: 1.0,
  }),
  sentryHandle(),
);
