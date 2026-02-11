import * as Sentry from '@sentry/node-core';
import { loggingTransport } from '@sentry-internal/node-integration-tests';
import { setupOtel } from '../../../../utils/setupOtel';

// eslint-disable-next-line @typescript-eslint/no-floating-promises
(async () => {
  const client = Sentry.init({
    dsn: 'https://public@dsn.ingest.sentry.io/1337',
    transport: loggingTransport,
    beforeSend(event) {
      return !event.type ? null : event;
    },
  });

  setupOtel(client);

  Sentry.captureException(new Error('this should get dropped by the event processor'));

  await Sentry.flush();

  Sentry.captureException(new Error('this should get dropped by the event processor'));
  Sentry.captureException(new Error('this should get dropped by the event processor'));

  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  Sentry.flush();
})();
