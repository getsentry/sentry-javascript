import * as Sentry from '@sentry/browser';

window.GrowthBook = class {
  constructor() {
    this._onFlags = Object.create(null);
    this._featureValues = Object.create(null);
  }

  isOn(featureKey) {
    return !!this._onFlags[featureKey];
  }

  getFeatureValue(featureKey, defaultValue) {
    return Object.prototype.hasOwnProperty.call(this._featureValues, featureKey)
      ? this._featureValues[featureKey]
      : defaultValue;
  }

  __setOn(featureKey, value) {
    this._onFlags[featureKey] = !!value;
  }

  __setFeatureValue(featureKey, value) {
    this._featureValues[featureKey] = value;
  }
};

window.Sentry = Sentry;
window.sentryGrowthBookIntegration = Sentry.growthbookIntegration({ growthbookClass: window.GrowthBook });

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  sampleRate: 1.0,
  tracesSampleRate: 1.0,
  integrations: [
    window.sentryGrowthBookIntegration,
    Sentry.browserTracingIntegration({ instrumentNavigation: false, instrumentPageLoad: false }),
  ],
});
