const { loggingTransport } = require('@sentry-internal/node-integration-tests');
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
});

// Stop the process from exiting before the transaction is sent
setInterval(() => {}, 1000);

const run = async () => {
  // Test ported from the OTEL implementation:
  // https://github.com/open-telemetry/opentelemetry-js-contrib/blob/0d6ebded313bb75b5a0e7a6422206c922daf3943/plugins/node/instrumentation-lru-memoizer/test/index.test.ts#L28
  const memoizer = require('lru-memoizer');

  let memoizerLoadCallback;
  const memoizedFoo = memoizer({
    load: (_param, callback) => {
      memoizerLoadCallback = callback;
    },
    hash: () => 'bar',
  });

  Sentry.startSpan({ op: 'run' }, async span => {
    const outerSpanContext = span.spanContext();

    memoizedFoo({ foo: 'bar' }, () => {
      const innerContext = Sentry.getActiveSpan().spanContext();

      // The span context should be the same as the outer span
      // Throwing an error here will cause the test to fail
      if (outerSpanContext !== innerContext) {
        throw new Error('Outer and inner span context should match');
      }
    });

    span.end();
  });

  // Invoking the load callback outside the span
  memoizerLoadCallback();
};

run();
