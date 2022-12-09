const Sentry = require('@sentry/node');
require('@sentry/tracing'); // this has a addExtensionMethods side effect
const { writeFileSync, existsSync, unlinkSync } = require('fs');
const { Worker } = require('node:worker_threads');
const { ProfilingIntegration } = require('../../lib/index'); // this has a addExtensionMethods side effect
const path = require('path');

if (existsSync(path.resolve(__dirname, 'main.profile.json'))) {
  unlinkSync(path.resolve(__dirname, 'main.profile.json'));
}

const transport = () => {
  return {
    send: (event) => {
      if (event[1][0][0].type === 'profile') {
        console.log('Writing main.profile.json');
        writeFileSync(path.resolve(__dirname, 'main.profile.json'), JSON.stringify(event[1][0][1]));
      }
      return Promise.resolve();
    },
    flush: () => {
      return Promise.resolve(true);
    }
  };
};

Sentry.init({
  dsn: 'https://7fa19397baaf433f919fbe02228d5470@o1137848.ingest.sentry.io/6625302',
  debug: true,
  tracesSampleRate: 1,
  // @ts-expect-error profilingSampleRate is not part of the options type yet
  profilesSampleRate: 1,
  transport,
  integrations: [new ProfilingIntegration()]
});

const transaction = Sentry.startTransaction({ name: 'main thread' });
const worker = new Worker(path.resolve(__dirname, './worker.js'));

function processInWorker() {
  return new Promise((resolve, reject) => {
    worker.on('message', (event) => {
      console.log('Event received in main thread', event);
      resolve(event);
    });
    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
    });

    worker.postMessage('ping');
  });
}

(async () => {
  await processInWorker();
  worker.terminate();
  transaction.finish();

  await Sentry.flush(2000);
  const getProfileThreadId = (profilePath) => {
    const profile = require(profilePath);
    return profile.profile.samples[0].thread_id;
  };

  const mainThreadId = getProfileThreadId(path.resolve(__dirname, 'main.profile.json'));
  const workerThreadId = getProfileThreadId(path.resolve(__dirname, 'worker.profile.json'));

  if (mainThreadId === workerThreadId) {
    throw new Error('Main thread and worker thread have the same thread_id');
  }
})();
