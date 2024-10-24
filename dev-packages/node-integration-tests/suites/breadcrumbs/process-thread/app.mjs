import { spawn } from 'child_process';
import { join } from 'path';
import { loggingTransport } from '@sentry-internal/node-integration-tests';
import * as Sentry from '@sentry/node';
import { Worker } from 'worker_threads';

const __dirname = new URL('.', import.meta.url).pathname;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
});

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
