import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';
import { fork } from 'child_process';
import * as path from 'path';

const __dirname = new URL('.', import.meta.url).pathname;

Sentry.init({
  debug: true,
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
});

fork(path.join(__dirname, 'child.mjs'));

setTimeout(() => {
  throw new Error('Exiting main process');
}, 3000);
