import * as Sentry from '@sentry/node-core';
import { loggingTransport } from '@sentry-internal/node-core-integration-tests';
import { setupOtel } from '../../../utils/setupOtel';

const client = Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
  integrations: [Sentry.onUnhandledRejectionIntegration({ mode: 'strict' })],
});

setupOtel(client);

// eslint-disable-next-line @typescript-eslint/no-floating-promises
Promise.reject('test rejection');
