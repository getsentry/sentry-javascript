import { E2E_TEST_DSN } from '$env/static/private';
import { handleErrorWithSentry, initCloudflareSentryHandle, sentryHandle, metrics } from '@sentry/sveltekit';
import { sequence } from '@sveltejs/kit/hooks';

export const handleError = handleErrorWithSentry();

export const handle = sequence(
  initCloudflareSentryHandle({
    dsn: E2E_TEST_DSN,
    tracesSampleRate: 1.0,
  }),
  sentryHandle(),
  ({ event, resolve }) => {
    metrics.count('requests');
    return resolve(event);
  },
);
