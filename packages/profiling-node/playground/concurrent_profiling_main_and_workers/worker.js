const Sentry = require('@sentry/node');
require('@sentry/tracing'); // this has a addExtensionMethods side effect
const { writeFileSync, existsSync, unlinkSync } = require('fs');
const { parentPort } = require('worker_threads');
const { ProfilingIntegration } = require('../../lib/index'); // this has a addExtensionMethods side effect
const path = require('path');

if (existsSync(path.resolve(__dirname, 'worker.profile.json'))) {
  unlinkSync(path.resolve(__dirname, 'worker.profile.json'));
}

const worker_waiting = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const transport = () => {
  return {
    send: (event) => {
      if (event[1][0][0].type === 'profile') {
        console.log('Writing worker.profile.json');
        writeFileSync(path.resolve(__dirname, 'worker.profile.json'), JSON.stringify(event[1][0][1]));
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
  integrations: [new ProfilingIntegration()],
  transport
});

parentPort.on('message', async function processingMessage(message) {
  const transaction = Sentry.startTransaction({ name: 'worker' });
  await worker_waiting(2000);
  transaction.finish();
  await Sentry.flush(2000);
  parentPort.postMessage('pong');
});
