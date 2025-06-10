import * as Sentry from '@sentry/node-core';
import { loggingTransport } from '@sentry-internal/node-integration-tests';
import { spawn } from 'child_process';
import { join } from 'path';
import { Worker } from 'worker_threads';
import { setupOtel } from '../../../utils/setupOtel.js';

const __dirname = new URL('.', import.meta.url).pathname;

const client = Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  integrations: [Sentry.childProcessIntegration({ captureWorkerErrors: false })],
  transport: loggingTransport,
});

setupOtel(client);

(async () => {
  await new Promise(resolve => {
    const child = spawn('sleep', ['a']);
    child.on('error', resolve);
    child.on('exit', resolve);
  });

  await new Promise(resolve => {
    const worker = new Worker(join(__dirname, 'worker.mjs'));
    worker.on('error', resolve);
    worker.on('exit', resolve);
  });

  throw new Error('This is a test error');
})();
