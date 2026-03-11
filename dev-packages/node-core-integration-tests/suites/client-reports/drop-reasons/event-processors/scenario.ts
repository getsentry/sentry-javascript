import * as Sentry from '@sentry/node-core';
import { loggingTransport } from '@sentry-internal/node-integration-tests';
import { setupOtel } from '../../../../utils/setupOtel';

(async () => {
  const client = Sentry.init({
    dsn: 'https://public@dsn.ingest.sentry.io/1337',
    transport: loggingTransport,
  });

  setupOtel(client);

  Sentry.addEventProcessor(event => {
    return !event.type ? null : event;
  });

  Sentry.captureException(new Error('this should get dropped by the event processor'));

  await Sentry.flush();

  Sentry.captureException(new Error('this should get dropped by the event processor'));
  Sentry.captureException(new Error('this should get dropped by the event processor'));

  Sentry.flush();
})();
