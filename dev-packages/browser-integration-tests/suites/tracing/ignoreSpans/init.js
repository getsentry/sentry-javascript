import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [
    Sentry.browserTracingIntegration({
      idleTimeout: 3000,
      finalTimeout: 3000,
      childSpanTimeout: 3000,
    }),
  ],
  ignoreSpans: [/ignore/],
  tracesSampleRate: 1,
  debug: true,
});

const waitFor = time => new Promise(resolve => setTimeout(resolve, time));

Sentry.startSpanManual(
  {
    name: 'take-me',
  },
  async span => {
    await waitFor(500);
    span.end();
  },
);

Sentry.startSpanManual(
  {
    name: 'ignore-me',
  },
  async span => {
    await waitFor(1500);
    span.end();
  },
);

Sentry.startSpanManual(
  {
    name: 'ignore-me-too',
  },
  async span => {
    await waitFor(2500);
    span.end();
  },
);
