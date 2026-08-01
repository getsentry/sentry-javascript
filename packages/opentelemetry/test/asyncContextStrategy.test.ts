import { context, trace, TraceFlags, type Context } from '@opentelemetry/api';
import type { Scope } from '@sentry/core';
import {
  addChildSpanToSpan,
  getAsyncContextStrategy,
  getCurrentScope,
  getIsolationScope,
  getMainCarrier,
  Scope as ScopeClass,
  SentryNonRecordingSpan,
  setAsyncContextStrategy,
  withIsolationScope,
  withScope,
} from '@sentry/core';
import { afterAll, beforeEach, describe, expect, it, test } from 'vitest';
import { SENTRY_TRACE_STATE_CHILD_IGNORED } from '../src/constants';
import { setOpenTelemetryContextAsyncContextStrategy } from '../src/asyncContextStrategy';
import { TraceState } from '../src/utils/TraceState';
import { mockSdkInit } from './helpers/mockSdkInit';

describe('asyncContextStrategy', () => {
  // `withIsolationScope` gives the forked current scope a fresh propagation context (unless it is
  // continuing an incoming trace), so scope data is expected to match apart from that context.
  function scopeDataWithoutPropagationContext(
    scope: Scope,
  ): Omit<ReturnType<Scope['getScopeData']>, 'propagationContext'> {
    const { propagationContext: _propagationContext, ...rest } = scope.getScopeData();
    return rest;
  }

  beforeEach(() => {
    getCurrentScope().clear();
    getIsolationScope().clear();

    mockSdkInit();
  });

  afterAll(() => {
    // clear the strategy
    setAsyncContextStrategy(undefined);
  });

  test('scope inheritance', () => {
    const initialScope = getCurrentScope();
    const initialIsolationScope = getIsolationScope();

    initialScope.setExtra('a', 'a');
    initialIsolationScope.setExtra('aa', 'aa');

    withIsolationScope(() => {
      const scope1 = getCurrentScope();
      const isolationScope1 = getIsolationScope();

      expect(scope1).not.toBe(initialScope);
      expect(isolationScope1).not.toBe(initialIsolationScope);

      expect(scopeDataWithoutPropagationContext(scope1)).toEqual(scopeDataWithoutPropagationContext(initialScope));
      expect(scope1.getPropagationContext().traceId).not.toBe(initialScope.getPropagationContext().traceId);
      expect(isolationScope1.getScopeData()).toEqual(initialIsolationScope.getScopeData());

      scope1.setExtra('b', 'b');
      isolationScope1.setExtra('bb', 'bb');

      withScope(() => {
        const scope2 = getCurrentScope();
        const isolationScope2 = getIsolationScope();

        expect(scope2).not.toBe(scope1);
        expect(isolationScope2).toBe(isolationScope1);

        expect(scope2.getScopeData()).toEqual(scope1.getScopeData());

        scope2.setExtra('c', 'c');

        expect(scope2.getScopeData().extra).toEqual({
          a: 'a',
          b: 'b',
          c: 'c',
        });

        expect(isolationScope2.getScopeData().extra).toEqual({
          aa: 'aa',
          bb: 'bb',
        });
      });
    });
  });

  test('tracing channel binding keeps the parent active for an ignored child span', () => {
    setOpenTelemetryContextAsyncContextStrategy();

    const parentSpan = trace.getTracer('test').startSpan('parent');
    const ignoredSpan = trace.wrapSpanContext({
      traceId: parentSpan.spanContext().traceId,
      spanId: '1234567890123456',
      traceFlags: TraceFlags.NONE,
      traceState: new TraceState().set(SENTRY_TRACE_STATE_CHILD_IGNORED, '1'),
    });

    context.with(trace.setSpan(context.active(), parentSpan), () => {
      const binding = getAsyncContextStrategy(getMainCarrier()).getTracingChannelBinding?.();
      const store = binding?.getStoreWithActiveSpan(ignoredSpan);

      expect(store).toBeDefined();
      expect(trace.getSpan(store as Context)).toBe(parentSpan);
    });

    parentSpan.end();
  });

  test('tracing channel binding keeps the parent active for a native ignored child span', () => {
    setOpenTelemetryContextAsyncContextStrategy();

    const parentSpan = trace.getTracer('test').startSpan('parent');
    const ignoredSpan = new SentryNonRecordingSpan({
      dropReason: 'ignored',
      traceId: parentSpan.spanContext().traceId,
    });
    addChildSpanToSpan(parentSpan, ignoredSpan);

    context.with(trace.setSpan(context.active(), parentSpan), () => {
      const binding = getAsyncContextStrategy(getMainCarrier()).getTracingChannelBinding?.();
      const store = binding?.getStoreWithActiveSpan(ignoredSpan);

      expect(store).toBeDefined();
      expect(trace.getSpan(store as Context)).toBe(parentSpan);
    });

    parentSpan.end();
  });

  test('tracing channel binding activates a native ignored root span with a remote parent', () => {
    setOpenTelemetryContextAsyncContextStrategy();

    const traceId = '12345678901234567890123456789012';
    const remoteParent = trace.wrapSpanContext({
      traceId,
      spanId: '1234567890123456',
      traceFlags: TraceFlags.SAMPLED,
      isRemote: true,
    });
    const ignoredSpan = new SentryNonRecordingSpan({
      dropReason: 'ignored',
      traceId,
    });

    context.with(trace.setSpan(context.active(), remoteParent), () => {
      const binding = getAsyncContextStrategy(getMainCarrier()).getTracingChannelBinding?.();
      const store = binding?.getStoreWithActiveSpan(ignoredSpan);

      expect(store).toBeDefined();
      expect(trace.getSpan(store as Context)).toBe(ignoredSpan);
    });
  });

  test('async scope inheritance', async () => {
    const initialScope = getCurrentScope();
    const initialIsolationScope = getIsolationScope();

    async function asyncSetExtra(scope: Scope, key: string, value: string): Promise<void> {
      await new Promise(resolve => setTimeout(resolve, 1));
      scope.setExtra(key, value);
    }

    initialScope.setExtra('a', 'a');
    initialIsolationScope.setExtra('aa', 'aa');

    await withIsolationScope(async () => {
      const scope1 = getCurrentScope();
      const isolationScope1 = getIsolationScope();

      expect(scope1).not.toBe(initialScope);
      expect(isolationScope1).not.toBe(initialIsolationScope);

      expect(scopeDataWithoutPropagationContext(scope1)).toEqual(scopeDataWithoutPropagationContext(initialScope));
      expect(scope1.getPropagationContext().traceId).not.toBe(initialScope.getPropagationContext().traceId);
      expect(isolationScope1.getScopeData()).toEqual(initialIsolationScope.getScopeData());

      await asyncSetExtra(scope1, 'b', 'b');
      await asyncSetExtra(isolationScope1, 'bb', 'bb');

      await withScope(async () => {
        const scope2 = getCurrentScope();
        const isolationScope2 = getIsolationScope();

        expect(scope2).not.toBe(scope1);
        expect(isolationScope2).toBe(isolationScope1);

        expect(scope2.getScopeData()).toEqual(scope1.getScopeData());

        await asyncSetExtra(scope2, 'c', 'c');

        expect(scope2.getScopeData().extra).toEqual({
          a: 'a',
          b: 'b',
          c: 'c',
        });

        expect(isolationScope2.getScopeData().extra).toEqual({
          aa: 'aa',
          bb: 'bb',
        });
      });
    });
  });

  test('concurrent scope contexts', () => {
    const initialScope = getCurrentScope();
    const initialIsolationScope = getIsolationScope();

    initialScope.setExtra('a', 'a');
    initialIsolationScope.setExtra('aa', 'aa');

    withIsolationScope(() => {
      const scope1 = getCurrentScope();
      const isolationScope1 = getIsolationScope();

      expect(scope1).not.toBe(initialScope);
      expect(isolationScope1).not.toBe(initialIsolationScope);

      expect(scopeDataWithoutPropagationContext(scope1)).toEqual(scopeDataWithoutPropagationContext(initialScope));
      expect(scope1.getPropagationContext().traceId).not.toBe(initialScope.getPropagationContext().traceId);
      expect(isolationScope1.getScopeData()).toEqual(initialIsolationScope.getScopeData());

      scope1.setExtra('b', 'b');
      isolationScope1.setExtra('bb', 'bb');

      withScope(() => {
        const scope2 = getCurrentScope();
        const isolationScope2 = getIsolationScope();

        expect(scope2).not.toBe(scope1);
        expect(isolationScope2).toBe(isolationScope1);

        expect(scope2.getScopeData()).toEqual(scope1.getScopeData());

        scope2.setExtra('c', 'c');

        expect(scope2.getScopeData().extra).toEqual({
          a: 'a',
          b: 'b',
          c: 'c',
        });

        expect(isolationScope2.getScopeData().extra).toEqual({
          aa: 'aa',
          bb: 'bb',
        });
      });
    });

    withIsolationScope(() => {
      const scope1 = getCurrentScope();
      const isolationScope1 = getIsolationScope();

      expect(scope1).not.toBe(initialScope);
      expect(isolationScope1).not.toBe(initialIsolationScope);

      expect(scopeDataWithoutPropagationContext(scope1)).toEqual(scopeDataWithoutPropagationContext(initialScope));
      expect(scope1.getPropagationContext().traceId).not.toBe(initialScope.getPropagationContext().traceId);
      expect(isolationScope1.getScopeData()).toEqual(initialIsolationScope.getScopeData());

      scope1.setExtra('b2', 'b');
      isolationScope1.setExtra('bb2', 'bb');

      withScope(() => {
        const scope2 = getCurrentScope();
        const isolationScope2 = getIsolationScope();

        expect(scope2).not.toBe(scope1);
        expect(isolationScope2).toBe(isolationScope1);

        expect(scope2.getScopeData()).toEqual(scope1.getScopeData());

        scope2.setExtra('c2', 'c');

        expect(scope2.getScopeData().extra).toEqual({
          a: 'a',
          b2: 'b',
          c2: 'c',
        });

        expect(isolationScope2.getScopeData().extra).toEqual({
          aa: 'aa',
          bb2: 'bb',
        });
      });
    });
  });

  test('concurrent async scope contexts', async () => {
    const initialScope = getCurrentScope();
    const initialIsolationScope = getIsolationScope();

    async function asyncSetExtra(scope: Scope, key: string, value: string): Promise<void> {
      await new Promise(resolve => setTimeout(resolve, 1));
      scope.setExtra(key, value);
    }

    initialScope.setExtra('a', 'a');
    initialIsolationScope.setExtra('aa', 'aa');

    await withIsolationScope(async () => {
      const scope1 = getCurrentScope();
      const isolationScope1 = getIsolationScope();

      expect(scope1).not.toBe(initialScope);
      expect(isolationScope1).not.toBe(initialIsolationScope);

      expect(scopeDataWithoutPropagationContext(scope1)).toEqual(scopeDataWithoutPropagationContext(initialScope));
      expect(scope1.getPropagationContext().traceId).not.toBe(initialScope.getPropagationContext().traceId);
      expect(isolationScope1.getScopeData()).toEqual(initialIsolationScope.getScopeData());

      await asyncSetExtra(scope1, 'b', 'b');
      await asyncSetExtra(isolationScope1, 'bb', 'bb');

      await withScope(async () => {
        const scope2 = getCurrentScope();
        const isolationScope2 = getIsolationScope();

        expect(scope2).not.toBe(scope1);
        expect(isolationScope2).toBe(isolationScope1);

        expect(scope2.getScopeData()).toEqual(scope1.getScopeData());

        await asyncSetExtra(scope2, 'c', 'c');

        expect(scope2.getScopeData().extra).toEqual({
          a: 'a',
          b: 'b',
          c: 'c',
        });

        expect(isolationScope2.getScopeData().extra).toEqual({
          aa: 'aa',
          bb: 'bb',
        });
      });
    });

    await withIsolationScope(async () => {
      const scope1 = getCurrentScope();
      const isolationScope1 = getIsolationScope();

      expect(scope1).not.toBe(initialScope);
      expect(isolationScope1).not.toBe(initialIsolationScope);

      expect(scopeDataWithoutPropagationContext(scope1)).toEqual(scopeDataWithoutPropagationContext(initialScope));
      expect(scope1.getPropagationContext().traceId).not.toBe(initialScope.getPropagationContext().traceId);
      expect(isolationScope1.getScopeData()).toEqual(initialIsolationScope.getScopeData());

      scope1.setExtra('b2', 'b');
      isolationScope1.setExtra('bb2', 'bb');

      await withScope(async () => {
        const scope2 = getCurrentScope();
        const isolationScope2 = getIsolationScope();

        expect(scope2).not.toBe(scope1);
        expect(isolationScope2).toBe(isolationScope1);

        expect(scope2.getScopeData()).toEqual(scope1.getScopeData());

        scope2.setExtra('c2', 'c');

        expect(scope2.getScopeData().extra).toEqual({
          a: 'a',
          b2: 'b',
          c2: 'c',
        });

        expect(isolationScope2.getScopeData().extra).toEqual({
          aa: 'aa',
          bb2: 'bb',
        });
      });
    });
  });

  describe('AsyncLocalStorage re-use', () => {
    it('re-uses the AsyncLocalStorage of an already-installed strategy on repeated setup', () => {
      setOpenTelemetryContextAsyncContextStrategy();
      const firstStorage = getAsyncContextStrategy(getMainCarrier()).getTracingChannelBinding?.()?.asyncLocalStorage;
      expect(firstStorage).toBeDefined();

      setOpenTelemetryContextAsyncContextStrategy();
      const secondStorage = getAsyncContextStrategy(getMainCarrier()).getTracingChannelBinding?.()?.asyncLocalStorage;

      expect(secondStorage).toBe(firstStorage);
    });

    it('returns a context manager backed by the re-used AsyncLocalStorage', () => {
      const firstLookup = setOpenTelemetryContextAsyncContextStrategy();
      const secondLookup = setOpenTelemetryContextAsyncContextStrategy();

      // The context manager returned on the second setup wraps the same AsyncLocalStorage instance,
      // so consumers that captured the lookup from the first setup keep observing the active context.
      expect(secondLookup.asyncLocalStorage).toBe(firstLookup.asyncLocalStorage);
      expect(getAsyncContextStrategy(getMainCarrier()).getTracingChannelBinding?.()?.asyncLocalStorage).toBe(
        firstLookup.asyncLocalStorage,
      );
    });
  });

  describe('withScope()', () => {
    it('will make the passed scope the active scope within the callback', () =>
      new Promise<void>(done => {
        withScope(scope => {
          expect(getCurrentScope()).toBe(scope);
          done();
        });
      }));

    it('will pass a scope that is different from the current active isolation scope', () =>
      new Promise<void>(done => {
        withScope(scope => {
          expect(getIsolationScope()).not.toBe(scope);
          done();
        });
      }));

    it('will always make the inner most passed scope the current scope when nesting calls', () =>
      new Promise<void>(done => {
        withIsolationScope(_scope1 => {
          withIsolationScope(scope2 => {
            expect(getIsolationScope()).toBe(scope2);
            done();
          });
        });
      }));

    it('forks the scope when not passing any scope', () =>
      new Promise<void>(done => {
        const initialScope = getCurrentScope();
        initialScope.setTag('aa', 'aa');

        withScope(scope => {
          expect(getCurrentScope()).toBe(scope);
          scope.setTag('bb', 'bb');
          expect(scope).not.toBe(initialScope);
          expect(scope.getScopeData().tags).toEqual({ aa: 'aa', bb: 'bb' });
          done();
        });
      }));

    it('forks the scope when passing undefined', () =>
      new Promise<void>(done => {
        const initialScope = getCurrentScope();
        initialScope.setTag('aa', 'aa');

        withScope(undefined, scope => {
          expect(getCurrentScope()).toBe(scope);
          scope.setTag('bb', 'bb');
          expect(scope).not.toBe(initialScope);
          expect(scope.getScopeData().tags).toEqual({ aa: 'aa', bb: 'bb' });
          done();
        });
      }));

    it('sets the passed in scope as active scope', () =>
      new Promise<void>(done => {
        const initialScope = getCurrentScope();
        initialScope.setTag('aa', 'aa');

        const customScope = new ScopeClass();

        withScope(customScope, scope => {
          expect(getCurrentScope()).toBe(customScope);
          expect(scope).toBe(customScope);
          done();
        });
      }));
  });

  describe('withIsolationScope()', () => {
    it('will make the passed isolation scope the active isolation scope within the callback', () =>
      new Promise<void>(done => {
        withIsolationScope(scope => {
          expect(getIsolationScope()).toBe(scope);
          done();
        });
      }));

    it('will pass an isolation scope that is different from the current active scope', () =>
      new Promise<void>(done => {
        withIsolationScope(scope => {
          expect(getCurrentScope()).not.toBe(scope);
          done();
        });
      }));

    it('will always make the inner most passed scope the current scope when nesting calls', () =>
      new Promise<void>(done => {
        withIsolationScope(_scope1 => {
          withIsolationScope(scope2 => {
            expect(getIsolationScope()).toBe(scope2);
            done();
          });
        });
      }));

    it('forks the isolation scope when not passing any isolation scope', () =>
      new Promise<void>(done => {
        const initialScope = getIsolationScope();
        initialScope.setTag('aa', 'aa');

        withIsolationScope(scope => {
          expect(getIsolationScope()).toBe(scope);
          scope.setTag('bb', 'bb');
          expect(scope).not.toBe(initialScope);
          expect(scope.getScopeData().tags).toEqual({ aa: 'aa', bb: 'bb' });
          done();
        });
      }));

    it('forks the isolation scope when passing undefined', () =>
      new Promise<void>(done => {
        const initialScope = getIsolationScope();
        initialScope.setTag('aa', 'aa');

        withIsolationScope(undefined, scope => {
          expect(getIsolationScope()).toBe(scope);
          scope.setTag('bb', 'bb');
          expect(scope).not.toBe(initialScope);
          expect(scope.getScopeData().tags).toEqual({ aa: 'aa', bb: 'bb' });
          done();
        });
      }));

    it('sets the passed in isolation scope as active isolation scope', () =>
      new Promise<void>(done => {
        const initialScope = getIsolationScope();
        initialScope.setTag('aa', 'aa');

        const customScope = new ScopeClass();

        withIsolationScope(customScope, scope => {
          expect(getIsolationScope()).toBe(customScope);
          expect(scope).toBe(customScope);
          done();
        });
      }));

    // A new trace must not inherit the previous trace's frozen DSC, sampling
    // decision or propagation span id. Keeping them makes the outgoing
    // `baggage` advertise the old trace id, marks the fresh trace as not
    // head-of-trace, and propagates a span id from a different trace.
    it('drops the previous trace data when giving a forked isolation scope its own trace', () => {
      const oldTraceId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      getCurrentScope().setPropagationContext({
        traceId: oldTraceId,
        sampleRand: 0.1,
        sampled: true,
        propagationSpanId: 'bbbbbbbbbbbbbbbb',
        dsc: { trace_id: oldTraceId, sampled: 'true' },
      });

      withIsolationScope(() => {
        const propagationContext = getCurrentScope().getPropagationContext();

        expect(propagationContext.traceId).toMatch(/^[a-f0-9]{32}$/);
        expect(propagationContext.traceId).not.toBe(oldTraceId);
        expect(propagationContext.sampleRand).toEqual(expect.any(Number));
        expect(propagationContext.sampled).toBeUndefined();
        expect(propagationContext.propagationSpanId).toBeUndefined();
        expect(propagationContext.dsc).toBeUndefined();
      });
    });
  });
});
