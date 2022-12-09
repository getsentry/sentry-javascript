import path from 'path';
import { writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { Worker } from 'node:worker_threads';
import * as Sentry from '@sentry/node';
import '@sentry/tracing';

import { ProfilingIntegration } from '../../src/index';

if (existsSync(path.resolve(__dirname, 'main.profile.json'))) {
  unlinkSync(path.resolve(__dirname, 'main.profile.json'));
}

const transport = () => {
  return {
    send: (event: any) => {
      if (event[1][0][0].type === 'profile') {
        console.log('Writing main.profile.json');
        writeFileSync(path.resolve(__dirname, 'main.profile.json'), JSON.stringify(event[1][0][1]));
      }
      return Promise.resolve();
    },
    flush: () => {
      return Promise.resolve(true);
    },
  };
};

Sentry.init({
  dsn: 'https://7fa19397baaf433f919fbe02228d5470@o1137848.ingest.sentry.io/6625302',
  debug: true,
  tracesSampleRate: 1,
  profilesSampleRate: 1,
  transport,
  integrations: [new ProfilingIntegration()],
});

const worker = new Worker(path.resolve(__dirname, './worker.js'));

function processInWorker(): Promise<void> {
  return new Promise((resolve, reject) => {
    worker.on('message', event => {
      console.log('Event received in main thread', event);
      resolve(event);
    });
    worker.on('error', reject);
    worker.on('exit', code => {
      if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
    });

    worker.postMessage('ping');
  });
}

const transaction = Sentry.startTransaction({ name: 'worker.cpu_profiler.ts' });
(async () => {
  await processInWorker();
  worker.terminate();
  transaction.finish();
  await Sentry.flush(2000);
})();
