import * as Sentry from '@sentry/browser';
import { httpClientIntegration } from '@sentry/browser';

window.Sentry = {
  ...Sentry,
  // This would be done by the CDN bundle otherwise
  httpClientIntegration: httpClientIntegration,
};

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [],
});
