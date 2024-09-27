import { E2E_TEST_DSN } from '$env/static/private';
import * as Sentry from '@sentry/sveltekit';

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: E2E_TEST_DSN,
  tunnel: `http://localhost:3031/`, // proxy server
});

// not logging anything to console to avoid noise in the test output
export const handleError = Sentry.handleErrorWithSentry(() => {});

export const handle = Sentry.sentryHandle();
