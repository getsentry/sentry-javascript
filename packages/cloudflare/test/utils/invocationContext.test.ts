import { getDefaultIsolationScope, getIsolationScope, GLOBAL_OBJ, withIsolationScope } from '@sentry/core';
import { AsyncLocalStorage } from 'async_hooks';
import { setAsyncLocalStorageAsyncContextStrategy } from '@sentry/server-utils/no-diagnostic-channels';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getInvocationState, setInvocationState } from '../../src/utils/invocationContext';
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
});
