import * as Sentry from '@sentry/sveltekit';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
});

export const handleError = Sentry.handleErrorWithSentry();
