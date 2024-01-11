/* eslint-disable no-unused-vars */
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  includeLocalVariables: true,
  beforeSend: _ => {
    return null;
  },
  // Stop the rate limiting from kicking in
  integrations: [new Sentry.Integrations.LocalVariables({ maxExceptionsPerSecond: 10000000 })],
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
