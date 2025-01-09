import * as Sentry from '@sentry/browser';

window.UnleashClient = class {
  isEnabled(_toggleName) {
    return false;
  }

  getVariant(_toggleName) {
    return {
      name: 'disabled',
      enabled: false,
    };
  }
};

window.Sentry = Sentry;
window.sentryUnleashIntegration = Sentry.unleashIntegration(window.UnleashClient);

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  sampleRate: 1.0,
  integrations: [window.sentryUnleashIntegration],
});


