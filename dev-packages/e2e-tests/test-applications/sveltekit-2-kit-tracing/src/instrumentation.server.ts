import * as Sentry from '@sentry/sveltekit';
import { E2E_TEST_DSN } from '$env/static/private';

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: E2E_TEST_DSN,
  debug: !!process.env.DEBUG,
  tunnel: `http://localhost:3031/`, // proxy server
  tracesSampleRate: 1.0,
  ...(process.env.E2E_USE_SENTRY_TRACE_PROVIDER === '1'
    ? {
        _experiments: {
          useSentryTraceProvider: true,
        },
      }
    : {}),
  spotlight: import.meta.env.DEV,
});
