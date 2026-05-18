import * as Sentry from '@sentry/node';
import memoizer from 'lru-memoizer';

const run = async () => {
  // Test ported from the OTEL implementation:
  // https://github.com/open-telemetry/opentelemetry-js-contrib/blob/0d6ebded313bb75b5a0e7a6422206c922daf3943/plugins/node/instrumentation-lru-memoizer/test/index.test.ts#L28
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
