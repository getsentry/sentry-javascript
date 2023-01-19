/* eslint-disable no-unused-vars */
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  _experiments: { includeStackLocals: true },
  integrations: [new Sentry.Integrations.LocalVariables({ captureAllExceptions: true })],
  beforeSend: event => {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(event));
  },
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

try {
  one('some name');
} catch (e) {
  Sentry.captureException(e);
}
