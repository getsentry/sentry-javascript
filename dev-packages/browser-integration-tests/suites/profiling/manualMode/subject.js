import * as Sentry from '@sentry/browser';
import { browserProfilingIntegration } from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [browserProfilingIntegration()],
  tracesSampleRate: 1,
  profileSessionSampleRate: 1,
  profileLifecycle: 'manual',
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

function fibonacci1(n) {
  if (n <= 1) {
    return n;
  }
  return fibonacci1(n - 1) + fibonacci1(n - 2);
}

function fibonacci2(n) {
  if (n <= 1) {
    return n;
  }
  return fibonacci1(n - 1) + fibonacci1(n - 2);
}

function notProfiledFib(n) {
  if (n <= 1) {
    return n;
  }
  return fibonacci1(n - 1) + fibonacci1(n - 2);
}

// Adding setTimeout to ensure we cross the sampling interval to avoid flakes

Sentry.uiProfiler.startProfiler();

fibonacci(40);
await new Promise(resolve => setTimeout(resolve, 25));

largeSum();
await new Promise(resolve => setTimeout(resolve, 25));

Sentry.uiProfiler.stopProfiler();

// ---

notProfiledFib(40);
await new Promise(resolve => setTimeout(resolve, 25));

// ---

Sentry.uiProfiler.startProfiler();

fibonacci2(40);
await new Promise(resolve => setTimeout(resolve, 25));

Sentry.uiProfiler.stopProfiler();

const client = Sentry.getClient();
await client?.flush(8000);
