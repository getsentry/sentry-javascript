import * as Sentry from '@sentry/browser';

// Create measures BEFORE SDK initializes

// Create a measure with detail
const measure = performance.measure('restricted-test-measure', {
  start: performance.now(),
  end: performance.now() + 1,
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

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [
    Sentry.browserTracingIntegration({
      idleTimeout: 9000,
    }),
  ],
  tracesSampleRate: 1,
});

// Also create a normal measure to ensure SDK still works
performance.measure('normal-measure', {
  start: performance.now(),
  end: performance.now() + 50,
  detail: 'this-should-work',
});

// Create a measure with complex detail object
performance.measure('complex-detail-measure', {
  start: performance.now(),
  end: performance.now() + 25,
  detail: {
    nested: {
      array: [1, 2, 3],
      object: {
        key: 'value',
      },
    },
    metadata: {
      type: 'test',
      version: '1.0',
      tags: ['complex', 'nested', 'object'],
    },
  },
});
