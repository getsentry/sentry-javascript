/* eslint-disable no-unused-vars */
const Sentry = require('@sentry/node');
const { loggingTransport } = require('@sentry-internal/node-integration-tests');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  includeLocalVariables: true,
  dataCollection: { stackFrameVariables: { deny: ['secretVar'] } },
  transport: loggingTransport,
});

process.on('uncaughtException', () => {
  // do nothing - this will prevent the Error below from closing this process
});

function one(name) {
  const keepVar = 'keep me';
  const secretVar = 'filter me';

  throw new Error('Enough!');
}

setTimeout(() => {
  one('some name');
}, 1000);
