import { env } from '$env/dynamic/private';
import * as Sentry from '@sentry/sveltekit';
import { sequence } from '@sveltejs/kit/hooks';

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: env.E2E_TEST_DSN,
  debug: true,
  tunnel: `http://localhost:3031/`, // proxy server
  tracesSampleRate: 1.0,
  beforeSendTransaction: txn => {
    // console.log('beforeSendTransaction', txn);
    return txn;
  },
});

// not logging anything to console to avoid noise in the test output
const myErrorHandler = ({ error, event }: any) => {};

export const handleError = Sentry.handleErrorWithSentry(myErrorHandler);

export const handle = sequence(async ({ event, resolve }) => {
  console.log('XX event issub', event.isSubRequest, Sentry.getActiveSpan());
  return resolve(event);
}, Sentry.sentryHandle());
