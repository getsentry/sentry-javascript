const Sentry = require('@sentry/node-core');
const { setupOtel } = require('../../../utils/setupOtel.js');

const client = Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
});

setupOtel(client);

setTimeout(() => {
  // This should not be called because the script throws before this resolves.
  // Using 3000ms to account for the SDK's 2000ms shutdown timeout + buffer.
  process.stdout.write("I'm alive!");
  process.exit(0);
}, 3000);

throw new Error();
