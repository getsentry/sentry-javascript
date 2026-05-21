const Sentry = require('@sentry/node-core');
const { setupOtel } = require('../../../utils/setupOtel.js');
const { expectProcessToExit } = require('../../../utils/expect-process-to-exit');

const client = Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
});

setupOtel(client);

expectProcessToExit();

throw new Error();
