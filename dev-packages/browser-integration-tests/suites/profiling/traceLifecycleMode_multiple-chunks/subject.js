import * as Sentry from '@sentry/browser';
import { browserProfilingIntegration } from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [browserProfilingIntegration()],
  tracesSampleRate: 1,
  profileSessionSampleRate: 1,
  profileLifecycle: 'trace',
});

function largeSum(amount = 1000000) {
  let sum = 0;
  for (let i = 0; i < amount; i++) {
    sum += Math.sqrt(i) * Math.sin(i);
  }
}

function fibonacci(n) {
  if (n <= 1) {
    return n;
  }
  return fibonacci(n - 1) + fibonacci(n - 2);
}

// Create two NON-overlapping root spans so that the profiler stops and emits a chunk
// after each span (since active root span count returns to 0 between them).
await Sentry.startSpanManual({ name: 'root-fibonacci-1', parentSpan: null, forceTransaction: true }, async span => {
  fibonacci(40);
  // Ensure we cross the sampling interval to avoid flakes
  await new Promise(resolve => setTimeout(resolve, 25));
  span.end();
});

// Small delay to ensure the first chunk is collected and sent
await new Promise(r => setTimeout(r, 25));

await Sentry.startSpanManual({ name: 'root-largeSum-2', parentSpan: null, forceTransaction: true }, async span => {
  largeSum();
  // Ensure we cross the sampling interval to avoid flakes
  await new Promise(resolve => setTimeout(resolve, 25));
  span.end();
});

const client = Sentry.getClient();
await client?.flush(5000);
