import { AsyncLocalStorage } from 'node:async_hooks';
import type { Scope } from '@sentry/core';
import { getDefaultCurrentScope, getDefaultIsolationScope, setAsyncContextStrategy } from '@sentry/core';

/**
 * Sets the async context strategy to use AsyncLocalStorage.
 *
 * This is a lightweight alternative to the OpenTelemetry-based strategy.
 * It uses Node's native AsyncLocalStorage directly without any OpenTelemetry dependencies.
 */
export function setAsyncLocalStorageAsyncContextStrategy(): void {
  const asyncStorage = new AsyncLocalStorage<{
    scope: Scope;
    isolationScope: Scope;
  }>();

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
    const scope = getScopes().scope.clone();
    const isolationScope = getScopes().isolationScope.clone();
    return asyncStorage.run({ scope, isolationScope }, () => {
      return callback(isolationScope);
    });
  }

  function withSetIsolationScope<T>(isolationScope: Scope, callback: (isolationScope: Scope) => T): T {
    const scope = getScopes().scope.clone();
    return asyncStorage.run({ scope, isolationScope }, () => {
      return callback(isolationScope);
    });
  }

  // In contrast to the browser, we can rely on async context isolation here
  function suppressTracing<T>(callback: () => T): T {
    return withScope(scope => {
      scope.setSDKProcessingMetadata({ __SENTRY_SUPPRESS_TRACING__: true });
      return callback();
    });
  }

  setAsyncContextStrategy({
    suppressTracing,
    withScope,
    withSetScope,
    withIsolationScope,
    withSetIsolationScope,
    getCurrentScope: () => getScopes().scope,
    getIsolationScope: () => getScopes().isolationScope,
  });
}
