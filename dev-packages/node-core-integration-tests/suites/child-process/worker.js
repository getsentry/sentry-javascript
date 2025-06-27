const Sentry = require('@sentry/node-core');
const { setupOtel } = require('../../utils/setupOtel.js');
const { loggingTransport } = require('@sentry-internal/node-integration-tests');
const path = require('path');
const { Worker } = require('worker_threads');

const client = Sentry.init({
  debug: true,
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
});

setupOtel(client);

new Worker(path.join(__dirname, 'child.js'));

setTimeout(() => {
  process.exit();
}, 3000);
