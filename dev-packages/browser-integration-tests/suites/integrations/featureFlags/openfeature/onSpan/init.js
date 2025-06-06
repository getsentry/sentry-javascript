import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;
window.sentryOpenFeatureIntegration = Sentry.openFeatureIntegration();

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  sampleRate: 1.0,
  tracesSampleRate: 1.0,
  integrations: [
    window.sentryOpenFeatureIntegration,
    Sentry.browserTracingIntegration({ instrumentNavigation: false, instrumentPageLoad: false }),
  ],
});

window.initialize = () => {
  return {
    getBooleanValue(flag, value) {
      let hook = new Sentry.OpenFeatureIntegrationHook();
      hook.after(null, { flagKey: flag, value: value });
      return value;
    },
  };
};
