import { loggingTransport } from '@sentry-internal/node-integration-tests';
import * as Sentry from '@sentry/node';
import * as iitm from 'import-in-the-middle';

new iitm.Hook((_, name) => {
  if (name !== 'http') {
    throw new Error(`'http' should be the only hooked modules but we just hooked '${name}'`);
  }
});

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  autoSessionTracking: false,
  transport: loggingTransport,
});

await import('./sub-module.mjs');
await import('http');
await import('os');
