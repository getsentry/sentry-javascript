import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

// eslint-disable-next-line @typescript-eslint/no-floating-promises
(async () => {
  Sentry.init({
    dsn: 'https://public@dsn.ingest.sentry.io/1337',
    transport: loggingTransport,
    beforeSend() {
      return null;
    },
  });

  // `contextLinesIntegration` processes events with stack frames asynchronously,
  // so the drop is only recorded after `close()` has started.
  Sentry.captureException(new Error('this should get dropped by beforeSend'));

  await Sentry.close();
})();
