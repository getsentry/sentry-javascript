import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1,
  transport: loggingTransport,
});

// eslint-disable-next-line @typescript-eslint/no-floating-promises
recordSpan(async () => {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  doSomething();
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  doSomethingWithError();
});

async function doSomething(): Promise<void> {
  return Promise.resolve();
}

async function doSomethingWithError(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 100));
  throw new Error('test error');
}

// Duplicating some code from vercel-ai to verify how things work in more complex/weird scenarios
function recordSpan(fn: (span: unknown) => Promise<void>): Promise<void> {
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
