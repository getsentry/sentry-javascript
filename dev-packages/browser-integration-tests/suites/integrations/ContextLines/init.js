import * as Sentry from '@sentry/browser';
import { contextLinesIntegration } from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [contextLinesIntegration()],
});
