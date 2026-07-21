import * as Sentry from '@sentry/node-core';
import { loggingTransport } from '@sentry-internal/node-integration-tests';
import { readFileSync } from 'fs';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  transport: loggingTransport,
  dataCollection: { userInfo: true },
});

readFileSync('non-existent-file.txt');
