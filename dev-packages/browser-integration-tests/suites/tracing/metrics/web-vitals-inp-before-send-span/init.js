import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  traceLifecycle: 'static',
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
  tracesSampleRate: 1,
  // A plain (non-streamed) `beforeSendSpan` operates on the v1 `SpanJSON`. INP is sent as a v2 span,
  // so this verifies the static callback still runs and its changes are carried into the v2 span.
  beforeSendSpan: Sentry.withStaticSpan(span => {
    if (span.op === 'ui.interaction.click') {
      span.description = 'scrubbed';
      span.data['custom.attribute'] = 'from-before-send-span';
    }

    return span;
  }),
  debug: true,
});

const client = Sentry.getClient();

// Force page load transaction name to a testable value
Sentry.startBrowserTracingPageLoadSpan(client, {
  name: 'test-url',
  attributes: {
    [Sentry.SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
  },
});
