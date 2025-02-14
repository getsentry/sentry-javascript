import * as Sentry from '@sentry/browser';

window.UnleashClient = class {
  isEnabled(x) {
    return x;
  }
};

window.Sentry = Sentry;
window.sentryUnleashIntegration = Sentry.unleashIntegration({ featureFlagClientClass: window.UnleashClient });

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  sampleRate: 1.0,
  integrations: [window.sentryUnleashIntegration],
  debug: true, // Required to test logging.
});
