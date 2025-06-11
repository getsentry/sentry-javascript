const Sentry = require('@sentry/node-core');
const { setupOtel } = require('../../../utils/setupOtel.js');

const client = Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [Sentry.onUnhandledRejectionIntegration({ mode: 'none' })],
});

setupOtel(client);

setTimeout(() => {
  process.stdout.write("I'm alive!");
  process.exit(0);
}, 500);

Promise.reject('test rejection');
