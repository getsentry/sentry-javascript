import * as Sentry from '@sentry/node-core';
import { loggingTransport } from '@sentry-internal/node-integration-tests';
import { setupOtel } from '../../../utils/setupOtel';

const client = Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  transport: loggingTransport,
  clientReportFlushInterval: 5000,
  beforeSend(event) {
    return !event.type ? null : event;
  },
});

setupOtel(client);

Sentry.captureException(new Error('this should get dropped by before send'));
