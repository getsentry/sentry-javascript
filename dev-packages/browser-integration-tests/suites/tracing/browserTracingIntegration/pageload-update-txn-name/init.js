import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;
window._testBaseTimestamp = performance.timeOrigin / 1000;

const sentryFeatureFlagsIntegration = Sentry.featureFlagsIntegration({
  featureFlags: {
    'session-aggregates': true,
  },
});

Sentry.init({
  integrations: [sentryFeatureFlagsIntegration],
});

Sentry.getFlagsIntegration().addFlags({
  'session-aggregates': true,
});

Sentry.addFlags({
  'session-aggregates': true,
});
