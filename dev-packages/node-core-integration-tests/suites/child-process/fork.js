const Sentry = require('@sentry/node-core');
const { setupOtel } = require('../../utils/setupOtel.js');
const { loggingTransport } = require('@sentry-internal/node-integration-tests');
const path = require('path');
const { fork } = require('child_process');

const client = Sentry.init({
  debug: true,
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
});

setupOtel(client);

fork(path.join(__dirname, 'child.mjs'));

setTimeout(() => {
  throw new Error('Exiting main process');
}, 3000);
