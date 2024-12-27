import * as Sentry from '@sentry/browser';

window.openFeatureClient = {
  _hooks: [],

  getBooleanValue(flag, value) {
    this._hooks.forEach(hook => {
      hook.error({ flagKey: flag, defaultValue: false }, new Error('flag eval error'));
    });
    return value;
  },

  addHooks(...hooks) {
    this._hooks = [...this._hooks, ...hooks];
  },
};

window.Sentry = Sentry;
window.sentryOpenFeatureIntegration = Sentry.openFeatureIntegration({openFeatureClient: window.openFeatureClient});

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  sampleRate: 1.0,
  integrations: [window.sentryOpenFeatureIntegration],
});
