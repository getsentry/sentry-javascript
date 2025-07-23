import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1,
  transport: loggingTransport,
});

recordSpan(async () => {
  doSomething();
  doSomethingWithError();
});

async function doSomething() {
  return Promise.resolve();
}

async function doSomethingWithError() {
  await new Promise(resolve => setTimeout(resolve, 100));
  throw new Error('test error');
}

function recordSpan(fn: (span: unknown) => Promise<void>) {
  return Sentry.startSpanManual({ name: 'test-span' }, async span => {
    try {
      const result = await fn(span);
      span.end();
      return result;
    } catch (error) {
      try {
        span.setStatus({ code: 2 });
      } finally {
        // always stop the span when there is an error:
        span.end();
      }

      throw error;
    }
  });
}
