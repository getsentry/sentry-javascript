import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

// Not using this as we want to test the getIntegrationByName() approach
// window.sentryFeatureFlagsIntegration = Sentry.featureFlagsIntegration();

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  sampleRate: 1.0,
  integrations: [Sentry.featureFlagsIntegration()],
});
