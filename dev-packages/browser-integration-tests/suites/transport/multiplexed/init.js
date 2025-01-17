import * as Sentry from '@sentry/browser';

import { makeFetchTransport, makeMultiplexedTransport } from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  transport: makeMultiplexedTransport(makeFetchTransport, ({ getEvent }) => {
    const event = getEvent('event');

    if (event.tags.to === 'a') {
      return ['https://public@dsn.ingest.sentry.io/1337'];
    } else if (event.tags.to === 'b') {
      return ['https://public@dsn.ingest.sentry.io/1337'];
    } else {
      throw new Error('Unknown destination');
    }
  }),
});
