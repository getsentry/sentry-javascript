/* eslint-disable no-unused-vars */
const Sentry = require('@sentry/node-core');
const { loggingTransport } = require('@sentry-internal/node-core-integration-tests');
const { setupOtel } = require('../../../utils/setupOtel.js');

const client = Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  transport: loggingTransport,
});

setupOtel(client);

process.on('uncaughtException', () => {
  // do nothing - this will prevent the Error below from closing this process
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

setTimeout(() => {
  one('some name');
}, 1000);
