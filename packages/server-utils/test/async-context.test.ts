import {
  getAsyncContextStrategy,
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  getMainCarrier,
  Scope,
  setAsyncContextStrategy,
  withIsolationScope,
  withScope,
} from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setAsyncLocalStorageAsyncContextStrategy } from '../src/async-context';

describe('withScope()', () => {
  beforeEach(() => {
    getIsolationScope().clear();
    getCurrentScope().clear();
    getGlobalScope().clear();

    setAsyncLocalStorageAsyncContextStrategy();
  });

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

      const customScope = new Scope();

      withScope(customScope, scope => {
        expect(getCurrentScope()).toBe(customScope);
        expect(scope).toBe(customScope);
        done();
      });
    }));

  it('does not fork the isolation scope when passing a scope', () =>
    new Promise<void>(done => {
      const initialIsolationScope = getIsolationScope();

      withScope(new Scope(), () => {
        expect(getIsolationScope()).toBe(initialIsolationScope);
        getIsolationScope().setTag('bb', 'bb');
        done();
      });

      expect(initialIsolationScope.getScopeData().tags).toEqual({ bb: 'bb' });
    }));
});

describe('withIsolationScope()', () => {
  beforeEach(() => {
    getIsolationScope().clear();
    getCurrentScope().clear();
    getGlobalScope().clear();

    setAsyncLocalStorageAsyncContextStrategy();
  });

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

      const customScope = new Scope();

      withIsolationScope(customScope, scope => {
        expect(getIsolationScope()).toBe(customScope);
        expect(scope).toBe(customScope);
        done();
      });
    }));

  it('forks the current scope as well, so mutations do not leak out', () =>
    new Promise<void>(done => {
      const initialScope = getCurrentScope();
      initialScope.setTag('aa', 'aa');

      withIsolationScope(() => {
        const scope = getCurrentScope();
        expect(scope).not.toBe(initialScope);
        expect(scope.getScopeData().tags).toEqual({ aa: 'aa' });

        scope.setTag('bb', 'bb');
        done();
      });

      expect(initialScope.getScopeData().tags).toEqual({ aa: 'aa' });
    }));

  it('forks the current scope as well when passing an isolation scope', () =>
    new Promise<void>(done => {
      const initialScope = getCurrentScope();
      initialScope.setTag('aa', 'aa');

      withIsolationScope(new Scope(), () => {
        const scope = getCurrentScope();
        expect(scope).not.toBe(initialScope);
        expect(scope.getScopeData().tags).toEqual({ aa: 'aa' });

        scope.setTag('bb', 'bb');
        done();
      });

      expect(initialScope.getScopeData().tags).toEqual({ aa: 'aa' });
    }));

  it('gives each forked isolation scope its own trace id when not continuing an incoming trace', () => {
    const traceIds: string[] = [];

    withIsolationScope(() => {
      traceIds.push(getCurrentScope().getPropagationContext().traceId);
    });
    withIsolationScope(() => {
      traceIds.push(getCurrentScope().getPropagationContext().traceId);
    });

    expect(traceIds[0]).toMatch(/^[a-f0-9]{32}$/);
    expect(traceIds[1]).toMatch(/^[a-f0-9]{32}$/);
    expect(traceIds[0]).not.toBe(traceIds[1]);
  });

  it('keeps the trace id when continuing an incoming trace (parentSpanId set)', () => {
    const incomingTraceId = 'cafecafecafecafecafecafecafecafe';
    getCurrentScope().setPropagationContext({
      traceId: incomingTraceId,
      parentSpanId: '1234567890abcdef',
      sampleRand: 0.42,
    });

    withIsolationScope(() => {
      expect(getCurrentScope().getPropagationContext().traceId).toBe(incomingTraceId);
    });
  });

  // A trace-id-only `sentry-trace` header yields a propagation context with a `dsc` but no
  // `parentSpanId`, because the span id is optional in the header. Such a trace is still being
  // continued, so its trace id must survive the fork.
  it('keeps the trace id when continuing an incoming trace without a span id (dsc set)', () => {
    const incomingTraceId = 'cafecafecafecafecafecafecafecafe';
    getCurrentScope().setPropagationContext({
      traceId: incomingTraceId,
      sampleRand: 0.42,
      dsc: { trace_id: incomingTraceId, sample_rate: '1' },
    });

    withIsolationScope(() => {
      const propagationContext = getCurrentScope().getPropagationContext();

      expect(propagationContext.traceId).toBe(incomingTraceId);
      expect(propagationContext.dsc).toEqual({ trace_id: incomingTraceId, sample_rate: '1' });
    });
  });

  // A new trace must not inherit the previous trace's sampling decision or propagation span id.
  // Keeping them would apply the old trace's sampling decision to the new one and propagate a
  // span id belonging to a different trace.
  it('drops the previous trace data when giving a forked isolation scope its own trace', () => {
    const oldTraceId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    getCurrentScope().setPropagationContext({
      traceId: oldTraceId,
      sampleRand: 0.1,
      sampled: true,
      propagationSpanId: 'bbbbbbbbbbbbbbbb',
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

describe('AsyncLocalStorage re-use', () => {
  afterEach(() => {
    setAsyncContextStrategy(undefined);
  });

  it('re-uses the AsyncLocalStorage of an already-installed strategy on repeated setup', () => {
    setAsyncLocalStorageAsyncContextStrategy();
    const firstStorage = getAsyncContextStrategy(getMainCarrier()).getTracingChannelBinding?.()?.asyncLocalStorage;
    expect(firstStorage).toBeDefined();

    setAsyncLocalStorageAsyncContextStrategy();
    const secondStorage = getAsyncContextStrategy(getMainCarrier()).getTracingChannelBinding?.()?.asyncLocalStorage;

    expect(secondStorage).toBe(firstStorage);
  });

  it('keeps scope propagation working after a repeated setup', () =>
    new Promise<void>(done => {
      setAsyncLocalStorageAsyncContextStrategy();

      // A consumer captures the store from the initial setup...
      const capturedStorage = getAsyncContextStrategy(getMainCarrier()).getTracingChannelBinding?.()?.asyncLocalStorage;

      // ...and then a second setup happens (e.g. a second `Sentry.init()`).
      setAsyncLocalStorageAsyncContextStrategy();

      withIsolationScope(isolationScope => {
        // The store captured before the second setup still observes the active scopes,
        // because the same AsyncLocalStorage instance was re-used.
        expect((capturedStorage as { getStore: () => { isolationScope: Scope } }).getStore().isolationScope).toBe(
          isolationScope,
        );
        expect(getIsolationScope()).toBe(isolationScope);
        done();
      });
    }));

  it('creates a new AsyncLocalStorage when no strategy is installed yet', () => {
    setAsyncContextStrategy(undefined);

    setAsyncLocalStorageAsyncContextStrategy();
    const storage = getAsyncContextStrategy(getMainCarrier()).getTracingChannelBinding?.()?.asyncLocalStorage;

    expect(storage).toBeDefined();
  });
});
