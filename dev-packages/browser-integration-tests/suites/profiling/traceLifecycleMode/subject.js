import * as Sentry from '@sentry/browser';
import { browserProfilingIntegration } from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [browserProfilingIntegration()],
  tracesSampleRate: 1,
  profileSessionSampleRate: 1,
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

let firstSpan;

Sentry.startSpanManual({ name: 'root-largeSum-1', parentSpan: null, forceTransaction: true }, span => {
  largeSum();
  firstSpan = span;
});

await Sentry.startSpanManual({ name: 'root-fibonacci-2', parentSpan: null, forceTransaction: true }, async span => {
  fibonacci(40);

  // Timeout to prevent flaky tests. Integration samples every 20ms, if function is too fast it might not get sampled
  await new Promise(resolve => setTimeout(resolve, 21));
  span.end();
});

await new Promise(r => setTimeout(r, 21));

firstSpan.end();

// Ensure envelope flush
const client = Sentry.getClient();
await client?.flush(5000);
