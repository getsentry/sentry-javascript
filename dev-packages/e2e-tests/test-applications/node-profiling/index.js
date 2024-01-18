const Sentry = require('@sentry/node');
const Profiling = require('@sentry/profiling-node');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

Sentry.init({
  dsn: 'https://7fa19397baaf433f919fbe02228d5470@o1137848.ingest.sentry.io/6625302',
  integrations: [new Profiling.ProfilingIntegration()],
  tracesSampleRate: 1.0,
  profilesSampleRate: 1.0,
});

const txn = Sentry.startTransaction('Precompile test');

(async () => {
  await wait(500);
  txn.finish();
})();
