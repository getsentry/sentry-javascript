import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [
    Sentry.browserTracingIntegration({
      idleTimeout: 4000,
      enableLongTask: false,
      enableInp: true,
      instrumentPageLoad: false,
      instrumentNavigation: false,
    }),
  ],
  tracesSampler: (samplingContext) => {
    if (samplingContext.attributes['sentry.origin'] === 'auto.http.browser.inp' && samplingContext.name.includes('ShouldNotCaptureButton')) {
      window.shouldNotCaptureButton = true;
      return 0;
    }
    return 1;
  },
  tracesSampleRate: 1,
});

const client = Sentry.getClient();

// Force page load transaction name to a testable value
Sentry.startBrowserTracingPageLoadSpan(client, {
  name: 'test-url',
  attributes: {
    [Sentry.SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
  },
});
