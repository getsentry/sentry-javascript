import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@[2001:db8::1]/1337',
  defaultIntegrations: false,
  sendClientReports: false,
  release: '1.0',
  transport: loggingTransport,
});

Sentry.captureException(new Error(Sentry.getClient()?.getDsn()?.host));
