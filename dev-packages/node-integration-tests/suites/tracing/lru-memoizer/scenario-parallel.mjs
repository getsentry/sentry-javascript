import * as Sentry from '@sentry/node';
import memoizer from 'lru-memoizer';

const run = async () => {
  // lru-memoizer's only job is to bind the active context onto each memoized callback, so the
  // callback runs in its originating span's context whenever the (possibly async) load resolves.
  // To test that: `load` captures its callback without resolving, so memoized calls stay queued.
  // We register one call per span, then resolve the load from outside both spans (see below) -
  // if binding works, each queued callback still sees its own span active.
  let memoizerLoadCallback;
  const memoizedFoo = memoizer({
    load: (_param, callback) => {
      memoizerLoadCallback = callback;
    },
    hash: () => 'bar',
  });

  // Concurrent calls with the same key share one in-flight load, so each span's callback is queued
  // against it. We record on each transaction whether its callback kept its own span's context.
  const first = Sentry.startSpan(
    { op: 'first' },
    firstSpan =>
      new Promise(resolve => {
        memoizedFoo({ foo: 'bar' }, () => {
          firstSpan.setAttribute(
            'memoized.context_preserved',
            Sentry.getActiveSpan()?.spanContext().spanId === firstSpan.spanContext().spanId,
          );
          resolve();
        });
      }),
  );

  const second = Sentry.startSpan(
    { op: 'second' },
    secondSpan =>
      new Promise(resolve => {
        memoizedFoo({ foo: 'bar' }, () => {
          secondSpan.setAttribute(
            'memoized.context_preserved',
            Sentry.getActiveSpan()?.spanContext().spanId === secondSpan.spanContext().spanId,
          );
          resolve();
        });
      }),
  );

  // Fire the single load outside both spans, resolving both queued waiters.
  memoizerLoadCallback();

  await Promise.all([first, second]);
};

run();
