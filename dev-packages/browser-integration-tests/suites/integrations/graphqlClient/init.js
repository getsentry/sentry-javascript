import * as Sentry from '@sentry/browser';
// Must import this like this to ensure the test transformation for CDN bundles works
import { graphqlClientIntegration } from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [
    Sentry.browserTracingIntegration(),
    graphqlClientIntegration({
      endpoints: ['http://sentry-test.io/foo'],
    }),
  ],
  tracesSampleRate: 1,
});
