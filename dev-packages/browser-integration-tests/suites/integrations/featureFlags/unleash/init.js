import * as Sentry from '@sentry/browser';

window.UnleashClient = class {
  constructor() {
    this._featureToVariant = {
      feat2: { name: 'variant1', enabled: true, feature_enabled: true, payload: { type: 'string', value: 'test' } },
      feat3: { name: 'eu-west', enabled: true, feature_enabled: true },
      feat4: {
        name: 'paid-orgs',
        enabled: true,
        feature_enabled: true,
        payload: {
          type: 'json',
          value: '{"foo": {"bar": "baz"}, "hello": [1, 2, 3]}',
        },
      },

      // Enabled feature with no configured variants.
      feat5: { name: 'disabled', enabled: false, feature_enabled: true },

      // Disabled feature.
      feat6: { name: 'disabled', enabled: false, feature_enabled: false },
    };

    // Variant returned for features that don't exist.
    // `feature_enabled` may be defined in prod, but we want to test the undefined case.
    this._fallbackVariant = {
      name: 'disabled',
      enabled: false,
    };
  }

  isEnabled(toggleName) {
    const variant = this._featureToVariant[toggleName] || this._fallbackVariant;
    return variant.feature_enabled || false;
  }

  getVariant(toggleName) {
    return this._featureToVariant[toggleName] || this._fallbackVariant;
  }
};

window.Sentry = Sentry;
window.sentryUnleashIntegration = Sentry.unleashIntegration(window.UnleashClient);

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  sampleRate: 1.0,
  integrations: [window.sentryUnleashIntegration],
});
