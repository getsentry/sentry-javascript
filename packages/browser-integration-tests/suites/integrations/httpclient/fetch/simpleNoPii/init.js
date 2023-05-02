import * as Sentry from '@sentry/browser';
import { HttpClient } from '@sentry/integrations';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [new HttpClient()],
  tracesSampleRate: 1,
  sendDefaultPii: false,
});
