import * as Sentry from '@sentry/bun';

Sentry.init({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });

// eslint-disable-next-line no-console
console.log('Sentry initialized');
