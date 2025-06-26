import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

// Force this so that the initial sampleRand is consistent
Math.random = () => 0.45;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [Sentry.browserTracingIntegration()],
  tracePropagationTargets: ['http://sentry-test-site.example'],
  tracesSampler: ({ name }) => {
    if (name === 'new-trace') {
      return 0.9;
    }

    return 0.5;
  },
});
