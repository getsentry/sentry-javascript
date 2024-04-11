import {
  getCurrentHubShim,
  getDefaultCurrentScope,
  getDefaultIsolationScope,
  setAsyncContextStrategy,
} from '@sentry/core';
import type { Hub, Scope } from '@sentry/types';
import { GLOBAL_OBJ, logger } from '@sentry/utils';

import { DEBUG_BUILD } from './debug-build';

interface AsyncLocalStorage<T> {
  getStore(): T | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  run<R, TArgs extends any[]>(store: T, callback: (...args: TArgs) => R, ...args: TArgs): R;
}

let asyncStorage: AsyncLocalStorage<{ scope: Scope; isolationScope: Scope }>;

/**
 * Sets the async context strategy to use AsyncLocalStorage which should be available in the edge runtime.
 */
export function setAsyncLocalStorageAsyncContextStrategy(): void {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
  const MaybeGlobalAsyncLocalStorage = (GLOBAL_OBJ as any).AsyncLocalStorage;

  if (!MaybeGlobalAsyncLocalStorage) {
    DEBUG_BUILD &&
      logger.warn(
        "Tried to register AsyncLocalStorage async context strategy in a runtime that doesn't support AsyncLocalStorage.",
      );
    return;
  }

  if (!asyncStorage) {
    asyncStorage = new MaybeGlobalAsyncLocalStorage();
  }

  function getScopes(): { scope: Scope; isolationScope: Scope } {
    const scopes = asyncStorage.getStore();

    if (scopes) {
      return scopes;
    }

    // fallback behavior:
    // if, for whatever reason, we can't find scopes on the context here, we have to fix this somehow
    return {
      scope: getDefaultCurrentScope(),
      isolationScope: getDefaultIsolationScope(),
    };
  }

  function getCurrentHub(): Hub {
    // eslint-disable-next-line deprecation/deprecation
    const hub = getCurrentHubShim();
    return {
      ...hub,
      getScope: () => {
        const scopes = getScopes();
        return scopes.scope;
      },
      getIsolationScope: () => {
        const scopes = getScopes();
        return scopes.isolationScope;
      },
    };
  }

  function withScope<T>(callback: (scope: Scope) => T): T {
    const scope = getScopes().scope.clone();
    const isolationScope = getScopes().isolationScope;
    return asyncStorage.run({ scope, isolationScope }, () => {
      return callback(scope);
    });
  }

  function withSetScope<T>(scope: Scope, callback: (scope: Scope) => T): T {
    const isolationScope = getScopes().isolationScope.clone();
    return asyncStorage.run({ scope, isolationScope }, () => {
      return callback(scope);
    });
  }

  function withIsolationScope<T>(callback: (isolationScope: Scope) => T): T {
    const scope = getScopes().scope;
    const isolationScope = getScopes().isolationScope.clone();
    return asyncStorage.run({ scope, isolationScope }, () => {
      return callback(isolationScope);
    });
  }

  function withSetIsolationScope<T>(isolationScope: Scope, callback: (isolationScope: Scope) => T): T {
    const scope = getScopes().scope;
    return asyncStorage.run({ scope, isolationScope }, () => {
      return callback(isolationScope);
    });
  }

  setAsyncContextStrategy({
    getCurrentHub,
    withScope,
    withSetScope,
    withIsolationScope,
    withSetIsolationScope,
    getCurrentScope: () => getScopes().scope,
    getIsolationScope: () => getScopes().isolationScope,
  });
}
