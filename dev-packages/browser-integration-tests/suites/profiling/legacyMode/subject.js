import * as Sentry from '@sentry/browser';
import { browserProfilingIntegration } from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [browserProfilingIntegration()],
  tracesSampleRate: 1,
  profilesSampleRate: 1,
});

function fibonacci(n) {
  if (n <= 1) {
    return n;
  }
  return fibonacci(n - 1) + fibonacci(n - 2);
}

await Sentry.startSpanManual({ name: 'root-fibonacci', parentSpan: null, forceTransaction: true }, async span => {
  fibonacci(30);

  // Timeout to prevent flaky tests. Integration samples every 20ms, if function is too fast it might not get sampled
  await new Promise(resolve => setTimeout(resolve, 21));
  span.end();
});
