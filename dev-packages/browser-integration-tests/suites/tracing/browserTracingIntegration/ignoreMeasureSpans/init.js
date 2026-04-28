import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [
    Sentry.browserTracingIntegration({
      ignorePerformanceApiSpans: ['measure-ignore', /mark-i/],
    }),
  ],
  tracesSampleRate: 1,
});

performance.mark('mark-pass');
performance.mark('mark-ignore');
performance.measure('measure-pass');
performance.measure('measure-ignore');
