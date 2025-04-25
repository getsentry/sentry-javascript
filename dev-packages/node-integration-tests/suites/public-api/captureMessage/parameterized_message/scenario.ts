import { loggingTransport } from '@sentry-internal/node-integration-tests';
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
});

const x = 'first';
const y = 'second';

Sentry.captureMessage(Sentry.parameterize`This is a log statement with ${x} and ${y} params`);
