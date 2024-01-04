import * as Sentry from '@sentry/browser';
import { ContextLines } from '@sentry/integrations';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [new ContextLines()],
});
