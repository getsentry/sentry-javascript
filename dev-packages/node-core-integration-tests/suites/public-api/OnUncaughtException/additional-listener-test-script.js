const Sentry = require('@sentry/node-core');
const { setupOtel } = require('../../../utils/setupOtel.js');
const { expectProcessToExit } = require('../../../utils/expect-process-to-exit');

const client = Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
});

setupOtel(client);

process.on('uncaughtException', () => {
  // do nothing - this will prevent the Error below from closing this process before the timeout resolves
});

expectProcessToExit();

throw new Error();
