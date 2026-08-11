import { getIsolationScope, getMainCarrier, GLOBAL_OBJ, type Scope, setAsyncContextStrategy } from '@sentry/core';
import { AsyncLocalStorage } from 'async_hooks';
import { setAsyncLocalStorageAsyncContextStrategy } from '@sentry/server-utils/no-diagnostic-channels';
import { beforeEach, describe, expect, it } from 'vitest';
import { withInvocationIsolationScope } from '../../src/utils/invocationScope';

describe('withInvocationIsolationScope()', () => {
  beforeEach(() => {
    getMainCarrier().__SENTRY__ = undefined;

    (GLOBAL_OBJ as any).AsyncLocalStorage = AsyncLocalStorage;
    setAsyncLocalStorageAsyncContextStrategy();
  });

  it('forks the isolation scope at the entry point', () => {
    const outerScope = getIsolationScope();

    withInvocationIsolationScope(scope => {
      expect(scope).not.toBe(outerScope);
      expect(getIsolationScope()).toBe(scope);
    });
  });

  it('inherits data from the enclosing isolation scope', () => {
    getIsolationScope().setTag('from-outer', 'yes');

    withInvocationIsolationScope(scope => {
      expect(scope.getScopeData().tags).toEqual({ 'from-outer': 'yes' });
    });
  });

  it('does not leak data written inside the invocation to the enclosing scope', () => {
    const outerScope = getIsolationScope();

    withInvocationIsolationScope(scope => {
      scope.setTag('from-invocation', 'yes');
      scope.setUser({ id: 'user-1' });
    });

    expect(outerScope.getScopeData().tags).toEqual({});
    expect(outerScope.getScopeData().user).toEqual({});
  });

  it('gives two sibling invocations independent scopes', () => {
    const scopes: Scope[] = [];

    withInvocationIsolationScope(scope => {
      scope.setTag('first', 'yes');
      scopes.push(scope);
    });

    withInvocationIsolationScope(scope => {
      scopes.push(scope);
      expect(scope.getScopeData().tags).toEqual({});
    });

    expect(scopes[0]).not.toBe(scopes[1]);
  });

  it('reuses the invocation scope when reentrant', () => {
    withInvocationIsolationScope(outer => {
      withInvocationIsolationScope(inner => {
        expect(inner).toBe(outer);
      });
    });
  });

  it('lets a reentrant call add to what the entry point set, and vice versa', () => {
    withInvocationIsolationScope(outer => {
      outer.setTag('outer', 'yes');

      withInvocationIsolationScope(inner => {
        expect(inner.getScopeData().tags).toEqual({ outer: 'yes' });
        inner.setTag('inner', 'yes');
      });

      expect(outer.getScopeData().tags).toEqual({ outer: 'yes', inner: 'yes' });
    });
  });

  it('treats an invocation following a reentrant one as a fresh entry point', () => {
    withInvocationIsolationScope(outer => {
      withInvocationIsolationScope(inner => {
        inner.setTag('nested', 'yes');
      });

      expect(outer.getScopeData().tags).toEqual({ nested: 'yes' });
    });

    withInvocationIsolationScope(scope => {
      expect(scope.getScopeData().tags).toEqual({});
    });
  });

  it('degrades to a no-op fork under a non-forking strategy', () => {
    // The core stack fallback never forks: `getIsolationScope()` always reports the shared default
    // scope, and `withIsolationScope` reuses it. So the active isolation scope stays the shared one
    // even inside the invocation — the computed clone is silently dropped by the strategy. Cloudflare
    // always installs the AsyncLocalStorage strategy, so this branch is not hit in production.
    setAsyncContextStrategy(undefined);

    const outerScope = getIsolationScope();

    withInvocationIsolationScope(() => {
      expect(getIsolationScope()).toBe(outerScope);
    });

    expect(getIsolationScope()).toBe(outerScope);
  });
});
