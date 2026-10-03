const Sentry = require('@sentry/node');
const { expectProcessToExit } = require('../../../utils/expect-process-to-exit');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [
    Sentry.onUncaughtExceptionIntegration({
      exitEvenIfOtherHandlersAreRegistered: false,
    }),
  ],
});

expectProcessToExit();

throw new Error();
