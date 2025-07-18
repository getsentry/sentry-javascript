/* eslint-disable no-unused-vars */
import * as Sentry from '@sentry/node-core';
import { loggingTransport } from '@sentry-internal/node-integration-tests';
import { setupOtel } from '../../../utils/setupOtel.js';

const client = Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  includeLocalVariables: true,
  transport: loggingTransport,
});

setupOtel(client);

class Some {
  async two(name) {
    return new Promise((_, reject) => {
      reject(new Error('Enough!'));
    });
  }
}

async function one(name) {
  const arr = [1, '2', null];
  const obj = {
    name,
    num: 5,
    functionsShouldNotBeIncluded: () => {},
    functionsShouldNotBeIncluded2() {},
  };
  const bool = false;
  const num = 0;
  const str = '';
  const something = undefined;
  const somethingElse = null;

  const ty = new Some();

  await ty.two(name);
}

setTimeout(async () => {
  try {
    await one('some name');
  } catch (e) {
    Sentry.captureException(e);
  }
}, 1000);
