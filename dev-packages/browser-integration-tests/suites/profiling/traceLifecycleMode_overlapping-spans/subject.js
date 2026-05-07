import * as Sentry from '@sentry/browser';
import { browserProfilingIntegration } from '@sentry/browser';

window.Sentry = Sentry;

const client = Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [browserProfilingIntegration()],
  tracesSampleRate: 1,
  profileSessionSampleRate: 1,
  profileLifecycle: 'trace',
});

function largeSum(amount) {
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
  // Enough iterations that largeSum stays on-stack across several profiler ticks (10ms interval); otherwise sampling can miss it entirely.
  largeSum(2_500_000);
  firstSpan = span;
});

await Sentry.startSpanManual({ name: 'root-fibonacci-2', parentSpan: null, forceTransaction: true }, async span => {
  fibonacci(40);

  Sentry.startSpan({ name: 'child-fibonacci', parentSpan: span }, childSpan => {
    console.log('child span');
  });

  // Profiler uses a 10ms sample interval — wait long enough for multiple ticks
  await new Promise(resolve => setTimeout(resolve, 40));
  span.end();
});

await new Promise(r => setTimeout(r, 40));

firstSpan.end();

await client?.flush(5000);
