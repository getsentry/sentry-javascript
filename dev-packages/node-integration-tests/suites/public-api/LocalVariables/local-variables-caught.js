/* eslint-disable no-unused-vars */
const Sentry = require('@sentry/node');
const { loggingTransport } = require('@sentry/utils');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  includeLocalVariables: true,
  transport: loggingTransport,
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

setTimeout(() => {
  try {
    one('some name');
  } catch (e) {
    Sentry.captureException(e);
  }
}, 1000);
