import * as Sentry from '@sentry/browser';
import { Feedback } from '@sentry-internal/feedback';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [new Feedback()],
});
