import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

// Force this so that the initial sampleRand is consistent
Math.random = () => 0.45;

// Polyfill crypto.randomUUID
crypto.randomUUID = function randomUUID() {
  return ([1e7] + 1e3 + 4e3 + 8e3 + 1e11).replace(
    /[018]/g,
    // eslint-disable-next-line no-bitwise
    c => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16),
  );
};

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
