import * as Sentry from '@sentry/node-core';
import { loggingTransport } from '@sentry-internal/node-integration-tests';
import * as iitm from 'import-in-the-middle';
import { setupOtel } from '../../../utils/setupOtel.js';

new iitm.Hook((_, name) => {
  if (name !== 'http') {
    throw new Error(`'http' should be the only hooked modules but we just hooked '${name}'`);
  }
});

const client = Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
});

setupOtel(client);

(async () => {
  await import('./sub-module.mjs');
  await import('http');
  await import('os');
})();
