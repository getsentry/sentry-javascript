const { loggingTransport } = require('@sentry-internal/node-core-integration-tests');
const Sentry = require('@sentry/node-core');
const { setupOtel } = require('../../../utils/setupOtel.js');

const client = Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
  beforeSend(event) {
    event.contexts = {
      ...event.contexts,
      traceData: {
        ...Sentry.getTraceData(),
        metaTags: Sentry.getTraceMetaTags(),
      },
    };
    return event;
  },
});

setupOtel(client);

Sentry.captureException(new Error('test error'));
