import * as Sentry from '@sentry/sveltekit';

// SvelteKit 3 loads this file before the app, which is where `Sentry.init` belongs.
Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
});
