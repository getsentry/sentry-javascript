const Sentry = require('@sentry/node');
const profiling = require('@sentry/profiling-node');

Sentry.init({
  dsn: '',
  integrations: [new profiling.ProfilingIntegration()],
  tracesSampleRate: 1,
  profilesSampleRate: 1
});

const transaction = Sentry.startTransaction({ name: `${process.env['BUNDLER']}-application-build` });

function sleep(time) {
  const stop = new Date().getTime();
  while (new Date().getTime() < stop + time) {
    // block
  }
}

sleep(1000);
transaction.finish();

(async () => {
  await Sentry.flush();
})();
