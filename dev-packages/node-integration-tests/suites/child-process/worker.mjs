import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';
import * as path from 'path';
import { Worker } from 'worker_threads';

const __dirname = new URL('.', import.meta.url).pathname;

Sentry.init({
  debug: true,
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
});

// eslint-disable-next-line no-unused-vars
const _worker = new Worker(path.join(__dirname, 'child.mjs'));

setTimeout(() => {
  process.exit();
}, 3000);
