import { debug, getDefaultIsolationScope, getIsolationScope, GLOBAL_OBJ, withIsolationScope } from '@sentry/core';
import { AsyncLocalStorage } from 'async_hooks';
import { setAsyncLocalStorageAsyncContextStrategy } from '@sentry/server-utils/no-diagnostic-channels';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getInvocationState, getInvocationWaitUntil, setInvocationState } from '../../src/utils/invocationContext';
import { withInvocationIsolationScope } from '../../src/utils/invocationScope';

describe('invocation state', () => {
  beforeEach(() => {
    (GLOBAL_OBJ as never).AsyncLocalStorage = AsyncLocalStorage;
    setAsyncLocalStorageAsyncContextStrategy();
  });

  it('returns undefined outside any invocation', () => {
    expect(getInvocationState()).toBeUndefined();
  });

  it('returns undefined for a forked scope that carries no state', () => {
    withIsolationScope(getDefaultIsolationScope().clone(), () => {
      expect(getInvocationState()).toBeUndefined();
    });
  });

  it('never attaches state to the default isolation scope and warns', () => {
    // The stack async-context strategy does not fork, so a wrapper can end up handing the
    // default isolation scope to setInvocationState. State on it would be shared by every
    // invocation in the isolate, so it must be dropped and read back as "no invocation".
    const warnSpy = vi.spyOn(debug, 'warn').mockImplementation(() => undefined);
    const ctx = { waitUntil: vi.fn(), passThroughOnException: vi.fn() };
    setInvocationState(getDefaultIsolationScope(), { ctx });

    expect(getInvocationState()).toBeUndefined();
    withIsolationScope(getDefaultIsolationScope(), () => {
      expect(getInvocationState()).toBeUndefined();
    });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Cannot track this invocation'));
  });

  it('exposes state attached to the active isolation scope', () => {
    const ctx = { waitUntil: vi.fn(), passThroughOnException: vi.fn() };
    const scope = getDefaultIsolationScope().clone();
    setInvocationState(scope, { ctx });

    withIsolationScope(scope, () => {
      expect(getInvocationState()?.ctx).toBe(ctx);
    });

    expect(getInvocationState()).toBeUndefined();
  });

  it('is not inherited by scope clones', () => {
    const scope = getDefaultIsolationScope().clone();
    setInvocationState(scope, { ctx: undefined });

    withIsolationScope(scope.clone(), () => {
      expect(getInvocationState()).toBeUndefined();
    });
  });

  it('is attached at the invocation entry point and kept when reentrant', () => {
    const outerCtx = { waitUntil: vi.fn(), passThroughOnException: vi.fn() };
    const innerCtx = { waitUntil: vi.fn(), passThroughOnException: vi.fn() };

    withInvocationIsolationScope(() => {
      expect(getInvocationState()?.ctx).toBe(outerCtx);

      withInvocationIsolationScope(() => {
        expect(getInvocationState()?.ctx).toBe(outerCtx);
      }, innerCtx);
    }, outerCtx);
  });

  it('isolates state between concurrent invocations', async () => {
    const ctxA = { waitUntil: vi.fn(), passThroughOnException: vi.fn() };
    const ctxB = { waitUntil: vi.fn(), passThroughOnException: vi.fn() };

    await Promise.all([
      withInvocationIsolationScope(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        expect(getInvocationState()?.ctx).toBe(ctxA);
      }, ctxA),
      withInvocationIsolationScope(async () => {
        await new Promise(resolve => setTimeout(resolve, 5));
        expect(getInvocationState()?.ctx).toBe(ctxB);
      }, ctxB),
    ]);

    expect(getIsolationScope()).toBe(getDefaultIsolationScope());
    expect(getInvocationState()).toBeUndefined();
  });

  it('resolves the context waitUntil once and caches it bound on the state', () => {
    const waitUntil = vi.fn();
    const readWaitUntil = vi.fn(() => waitUntil);
    const ctx = {
      passThroughOnException: vi.fn(),
      get waitUntil() {
        return readWaitUntil();
      },
    };
    const state = { ctx };

    const first = getInvocationWaitUntil(state);
    const second = getInvocationWaitUntil(state);

    expect(second).toBe(first);
    expect(readWaitUntil).toHaveBeenCalledTimes(1);
    const promise = Promise.resolve();
    first?.(promise);
    expect(waitUntil).toHaveBeenCalledWith(promise);
  });

  it('caches "no usable waitUntil" when reading it throws', () => {
    const readWaitUntil = vi.fn(() => {
      throw new Error('torn down');
    });
    const ctx = {
      passThroughOnException: vi.fn(),
      get waitUntil(): never {
        return readWaitUntil() as never;
      },
    };
    const state = { ctx };

    expect(getInvocationWaitUntil(state)).toBeUndefined();
    expect(getInvocationWaitUntil(state)).toBeUndefined();
    expect(readWaitUntil).toHaveBeenCalledTimes(1);
  });

  it('returns undefined for a state without a context', () => {
    expect(getInvocationWaitUntil({ ctx: undefined })).toBeUndefined();
  });
});
