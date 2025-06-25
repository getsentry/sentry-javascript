import * as Sentry from '@sentry/node-core';
import { setupOtel } from '../../../utils/setupOtel.js';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

const client = Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  integrations: [Sentry.modulesIntegration()],
  transport: loggingTransport,
});


setupOtel(client);
