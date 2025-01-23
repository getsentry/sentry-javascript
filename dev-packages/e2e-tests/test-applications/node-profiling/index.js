const Sentry = require('@sentry/node');
const { nodeProfilingIntegration } = require('@sentry/profiling-node');
const { inspect } = require('util');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function transport(_) {
  return {
    send(envelope) {
      // eslint-disable-next-line no-console
      console.log(inspect(envelope, false, null, true));
      return Promise.resolve({ statusCode: 200 });
    },
    flush() {
      return new Promise(resolve => setTimeout(() => resolve(true), 1000));
    },
  };
}

Sentry.init({
  debug: true,
  dsn: 'https://7fa19397baaf433f919fbe02228d5470@o1137848.ingest.sentry.io/6625302',
  integrations: [nodeProfilingIntegration()],
  tracesSampleRate: 1.0,
  profilesSampleRate: 1.0,
  transport,
});

Sentry.startSpan({ name: 'Precompile test' }, async () => {
  await wait(500);
});
