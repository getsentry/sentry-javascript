import * as Sentry from '@sentry/browser';
import { httpClientIntegration } from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [httpClientIntegration()],
  tracesSampleRate: 1,
  // todo(v11): remove together with the sendDefaultPii guard in httpclient.ts (JS-2580)
  sendDefaultPii: true,
});
