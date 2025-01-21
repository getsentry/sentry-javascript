import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';
import * as path from 'path';
import { fork } from 'child_process';

const __dirname = new URL('.', import.meta.url).pathname;

Sentry.init({
  debug: true,
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  integrations: [Sentry.childProcessIntegration()],
  transport: loggingTransport,
});

const _child = fork(path.join(__dirname, 'child.mjs'));

setTimeout(() => {
  throw new Error('Exiting main process');
}, 3000);
