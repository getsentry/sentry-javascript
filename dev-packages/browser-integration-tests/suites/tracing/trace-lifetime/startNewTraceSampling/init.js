import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

const originalRandom = Math.random;

// Force this so that the initial sampleRand is between 0.35 and 0.45
Math.random = () =>  0.35 + Math.random() * 0.1;

// polyfill for crypto.randomUUID if not available (e.g. in non-secure contexts)
window.crypto = window.crypto || {};
window.crypto.randomUUID =
  window.crypto.randomUUID ||
  (() => {
    return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c =>
      // eslint-disable-next-line no-bitwise
      (c ^ (((originalRandom() * 16) & 15) >> (c / 4))).toString(16),
    );
  });

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
