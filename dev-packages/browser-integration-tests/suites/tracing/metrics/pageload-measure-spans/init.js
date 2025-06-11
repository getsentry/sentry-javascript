// Add measure before SDK initializes
import * as Sentry from '@sentry/browser';

const end = performance.now();

// Test 1: Measure with object detail
performance.measure('Next.js-before-hydration', {
  duration: 1000,
  end,
  detail: {
    component: 'HomePage',
    renderTime: 123.45,
    isSSR: true,
  },
});

// Test 2: Measure with primitive detail
performance.measure('custom-metric', {
  duration: 500,
  detail: 'simple-string-detail',
});

// Test 3: Measure with complex detail
performance.measure('complex-measure', {
  duration: 200,
  detail: {
    nested: {
      value: 'test',
      array: [1, 2, 3],
    },
  },
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
