import { env } from '$env/dynamic/private';
import * as Sentry from '@sentry/sveltekit';

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: env.E2E_TEST_DSN,
  debug: !!process.env.DEBUG,
  tunnel: `http://localhost:3031/`, // proxy server
  tracesSampleRate: 1.0,
});

// not logging anything to console to avoid noise in the test output
const myErrorHandler = ({ error, event }: any) => {};

export const handleError = Sentry.handleErrorWithSentry(myErrorHandler);

export const handle = Sentry.sentryHandle();
