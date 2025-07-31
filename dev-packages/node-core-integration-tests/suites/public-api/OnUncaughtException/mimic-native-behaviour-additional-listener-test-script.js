const Sentry = require('@sentry/node-core');
const { setupOtel } = require('../../../utils/setupOtel.js');

const client = Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [
    Sentry.onUncaughtExceptionIntegration({
      exitEvenIfOtherHandlersAreRegistered: false,
    }),
  ],
});

setupOtel(client);

process.on('uncaughtException', () => {
  // do nothing - this will prevent the Error below from closing this process before the timeout resolves
});

setTimeout(() => {
  process.stdout.write("I'm alive!");
  process.exit(0);
}, 500);

throw new Error();
