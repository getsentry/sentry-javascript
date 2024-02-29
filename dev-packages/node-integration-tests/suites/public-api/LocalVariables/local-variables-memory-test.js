/* eslint-disable no-unused-vars */
const Sentry = require('@sentry/node');
const { loggingTransport } = require('@sentry-internal/node-integration-tests');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  includeLocalVariables: true,
  transport: loggingTransport,
  // Stop the rate limiting from kicking in
  integrations: [Sentry.localVariablesIntegration({ maxExceptionsPerSecond: 10000000 })],
});

class Some {
  two(name) {
    throw new Error('Enough!');
  }
}

function one(name) {
  const arr = [1, '2', null];
  const obj = {
    name,
    num: 5,
  };
  const bool = false;
  const num = 0;
  const str = '';
  const something = undefined;
  const somethingElse = null;

  const ty = new Some();

  ty.two(name);
}

// Every millisecond cause a caught exception
setInterval(() => {
  try {
    one('some name');
  } catch (e) {
    //
  }
}, 1);

// Every second send a memory usage update to parent process
setInterval(() => {
  process.send({ memUsage: process.memoryUsage() });
}, 1000);
