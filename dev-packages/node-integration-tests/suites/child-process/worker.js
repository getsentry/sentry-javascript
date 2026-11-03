const Sentry = require('@sentry/node');
const { loggingTransport } = require('@sentry-internal/node-integration-tests');
const path = require('path');
const { Worker } = require('worker_threads');

Sentry.init({
  debug: true,
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
});

new Worker(path.join(__dirname, 'child.js'));

setTimeout(() => {
  process.exit();
}, 3000);
