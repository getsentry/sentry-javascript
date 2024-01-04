/* eslint-disable no-unused-vars */
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  beforeSend: event => {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(event));
  },
});

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

  const ty = new Some();

  ty.two(name);
}

setTimeout(() => {
  one('some name');
}, 1000);
