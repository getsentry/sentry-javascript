import * as Sentry from '@sentry/browser';

// Create measures BEFORE SDK initializes

// Create a measure with detail
const measure = performance.measure('firefox-test-measure', {
  duration: 100,
  detail: { test: 'initial-value' },
});

// Simulate Firefox's permission denial by overriding the detail getter
// This mimics the actual Firefox behavior where accessing detail throws
Object.defineProperty(measure, 'detail', {
  get() {
    throw new DOMException('Permission denied to access object', 'SecurityError');
  },
  configurable: false,
  enumerable: true,
});

// Also create a normal measure to ensure SDK still works
performance.measure('normal-measure', {
  duration: 50,
  detail: 'this-should-work',
});

window.Sentry = Sentry;

Sentry.init({
  debug: true,
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [
    Sentry.browserTracingIntegration({
      idleTimeout: 9000,
    }),
  ],
  tracesSampleRate: 1,
});
