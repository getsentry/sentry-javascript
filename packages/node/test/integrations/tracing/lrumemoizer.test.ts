/*
 * Tests ported from @opentelemetry/instrumentation-lru-memoizer@0.62.0
 * Original source: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/packages/instrumentation-lru-memoizer
 * Licensed under the Apache License, Version 2.0
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as Sentry from '../../../src';
import { LruMemoizerInstrumentation } from '../../../src/integrations/tracing/lrumemoizer/vendored/instrumentation';
import { cleanupOtel, mockSdkInit } from '../../helpers/mockSdkInit';

type MemoizerCallback = (err: Error | null, result?: string) => void;
type Memoizer = (param: unknown, callback?: MemoizerCallback | null) => void;
type MemoizerModule = ((options: unknown) => Memoizer) & { sync: (options: unknown) => (param: unknown) => string };

describe('lru-memoizer instrumentation', () => {
  let instrumentation: LruMemoizerInstrumentation;

  beforeEach(() => {
    mockSdkInit({ tracesSampleRate: 1 });
    instrumentation = new LruMemoizerInstrumentation();
  });

  afterEach(() => {
    instrumentation.disable();
    cleanupOtel();
  });

  // Create a fake `lru-memoizer`.
  // The fake queues the instrumented callback so it can be invoked from outside the originating span.
  function getMemoizer(): { memoizer: MemoizerModule; queuedCallbacks: MemoizerCallback[] } {
    const queuedCallbacks: MemoizerCallback[] = [];
    const fakeModule = Object.assign(
      (_options: unknown) => (_param: unknown, callback?: MemoizerCallback | null) => {
        if (callback) {
          queuedCallbacks.push(callback);
        }
      },
      { sync: (_options: unknown) => (_param: unknown) => 'foo' },
    ) as MemoizerModule;

    const memoizer = instrumentation.getModuleDefinitions()[0]!.patch!(fakeModule) as MemoizerModule;
    return { memoizer, queuedCallbacks };
  }

  describe('async', () => {
    it('should invoke load callback with original context', () => {
      const { memoizer, queuedCallbacks } = getMemoizer();
      const memoizedFoo = memoizer({ max: 10, load: () => {}, hash: () => 'bar' });

      let outerSpan: unknown;
      let activeSpanInCallback: unknown;
      Sentry.startSpan({ name: 'memoized invocation' }, span => {
        outerSpan = span;
        memoizedFoo({ foo: 'bar' }, () => {
          activeSpanInCallback = Sentry.getActiveSpan();
        });
      });

      // we invoke the callback from outside of the above span's context.
      // however, we expect that the callback is called with the context of the original invocation
      queuedCallbacks[0]!(null, 'result');
      expect(activeSpanInCallback).toBe(outerSpan);
    });

    it('should invoke callback with right context when serving 2 parallel async requests', () => {
      const { memoizer, queuedCallbacks } = getMemoizer();
      const memoizedFoo = memoizer({ max: 10, load: () => {}, hash: () => 'bar' });

      const observed: Array<{ expected: unknown; actual: unknown }> = [];

      Sentry.startSpan({ name: 'first request' }, firstSpan => {
        memoizedFoo({ foo: 'bar' }, () => {
          observed.push({ expected: firstSpan, actual: Sentry.getActiveSpan() });
        });
      });

      Sentry.startSpan({ name: 'second request' }, secondSpan => {
        memoizedFoo({ foo: 'bar' }, () => {
          observed.push({ expected: secondSpan, actual: Sentry.getActiveSpan() });
        });
      });

      expect(queuedCallbacks.length).toBe(2);
      queuedCallbacks[0]!(null, 'result');
      queuedCallbacks[1]!(null, 'result');

      expect(observed).toHaveLength(2);
      observed.forEach(({ expected, actual }) => {
        expect(actual).toBe(expected);
      });
    });

    it('should not throw when last argument is not callback', () => {
      const { memoizer } = getMemoizer();
      const memoizedFoo = memoizer({ max: 10, load: () => 'foo', hash: () => 'bar' });

      // this is not valid but we want to make sure it does not throw or act badly
      expect(() => memoizedFoo({ foo: 'bar' }, null)).not.toThrow();
    });
  });

  describe('sync', () => {
    it('should not break sync memoizer', () => {
      const { memoizer } = getMemoizer();

      // the sync memoizer is passed through untouched by the patch
      const memoizedFoo = memoizer.sync({ max: 10, load: () => 'foo', hash: () => 'bar' });
      expect(memoizedFoo({ foo: 'bar' })).toBe('foo');
    });
  });
});
