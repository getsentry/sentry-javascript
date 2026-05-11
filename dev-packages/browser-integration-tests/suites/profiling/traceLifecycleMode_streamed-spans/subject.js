import * as Sentry from '@sentry/browser';
import { browserProfilingIntegration, spanStreamingIntegration } from '@sentry/browser';

window.Sentry = Sentry;

const client = Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [spanStreamingIntegration(), browserProfilingIntegration()],
  tracesSampleRate: 1,
  traceLifecycle: 'stream',
  profileSessionSampleRate: 1,
  profileLifecycle: 'trace',
});

function fibonacci(n) {
  if (n <= 1) {
    return n;
  }
  return fibonacci(n - 1) + fibonacci(n - 2);
}

await Sentry.startSpanManual({ name: 'root-fibonacci', parentSpan: null, forceTransaction: true }, async span => {
  fibonacci(40);

  Sentry.startSpan({ name: 'child-span-1', parentSpan: span }, () => {
    fibonacci(20);
  });

  Sentry.startSpan({ name: 'child-span-2', parentSpan: span }, () => {
    fibonacci(20);
  });

  await new Promise(resolve => setTimeout(resolve, 40));
  span.end();
});

await client?.flush(5000);
