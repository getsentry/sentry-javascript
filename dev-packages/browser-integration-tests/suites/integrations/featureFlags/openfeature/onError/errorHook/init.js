import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;
window.sentryOpenFeatureIntegration = Sentry.openFeatureIntegration();

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  sampleRate: 1.0,
  integrations: [window.sentryOpenFeatureIntegration],
});

window.initialize = () => {
  return {
    getBooleanValue(flag, value) {
      let hook = new Sentry.OpenFeatureIntegrationHook();
      hook.error({ flagKey: flag, defaultValue: false }, new Error('flag eval error'));
      return value;
    },
  };
};
