import * as Sentry from '@sentry/browser';
import { httpClientIntegration } from '@sentry/integrations';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [httpClientIntegration()],
  tracesSampleRate: 1,
  sendDefaultPii: true,
});
