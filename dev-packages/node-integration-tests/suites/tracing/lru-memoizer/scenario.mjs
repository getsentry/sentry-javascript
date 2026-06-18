import * as Sentry from '@sentry/node';
import memoizer from 'lru-memoizer';

const run = async () => {
  // The sync memoizer is passed through untouched by the instrumentation.
  const memoizedSync = memoizer.sync({ load: () => 'foo', hash: () => 'bar' });
  if (memoizedSync({ foo: 'bar' }) !== 'foo') {
    throw new Error('Sync memoizer should return the loaded value');
  }

  // A non-function last argument must be passed through without throwing.
  const memoizedNoCallback = memoizer({ load: () => {}, hash: () => 'bar' });
  memoizedNoCallback({ foo: 'bar' }, null);

  // lru-memoizer's only job is to bind the active context onto the memoized callback, so it runs in
  // its originating span's context whenever the (possibly async) load resolves. To test that, `load`
  // captures its callback without resolving (the call stays queued), and we resolve it later from
  // outside the span.
  // Test ported from the OTEL implementation:
  // https://github.com/open-telemetry/opentelemetry-js-contrib/blob/0d6ebded313bb75b5a0e7a6422206c922daf3943/plugins/node/instrumentation-lru-memoizer/test/index.test.ts#L28
  let memoizerLoadCallback;
  const memoizedFoo = memoizer({
    load: (_param, callback) => {
      memoizerLoadCallback = callback;
    },
    hash: () => 'bar',
  });

  // Keep the span open until the memoized callback fires, recording on the transaction whether the
  // callback ran in the originating span's context.
  const spanFinished = Sentry.startSpan(
    { op: 'run' },
    span =>
      new Promise(resolve => {
        memoizedFoo({ foo: 'bar' }, () => {
          span.setAttribute(
            'memoized.context_preserved',
            Sentry.getActiveSpan()?.spanContext().spanId === span.spanContext().spanId,
          );
          resolve();
        });
      }),
  );

  // Fire the load outside the span, so the assertion above proves the context was restored.
  memoizerLoadCallback();

  await spanFinished;
};

run();
