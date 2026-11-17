import * as Sentry from '@sentry/sveltekit';

Sentry.init({
  dsn: 'http://public@localhost:3031/1337',
  tunnel: true,
  tracesSampleRate: 1,
});

export const handleError = Sentry.handleErrorWithSentry();
