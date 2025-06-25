import * as Sentry from '@sentry/node-core';
import { setupOtel } from '../../utils/setupOtel.js';
import { loggingTransport } from '@sentry-internal/node-integration-tests';
import { fork } from 'child_process';
import * as path from 'path';

const __dirname = new URL('.', import.meta.url).pathname;

const client = Sentry.init({
  debug: true,
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
});


setupOtel(client);

fork(path.join(__dirname, 'child.mjs'));

setTimeout(() => {
  throw new Error('Exiting main process');
}, 3000);
