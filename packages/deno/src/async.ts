// Need to use node: prefix for deno compatibility
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Scope } from '@sentry/core';
import { getDefaultCurrentScope, getDefaultIsolationScope, setAsyncContextStrategy } from '@sentry/core';

let installed = false;

/**
 * Sets the async context strategy to use AsyncLocalStorage.
 *
 * Idempotent: multiple integrations each call this from their `setupOnce`,
 * but they must all share a single `AsyncLocalStorage` so context propagates
 * between them. The first call wins, later calls are no-ops. This prevents
 * orphaning an in-flight context if an integration is set up asynchronously.
 *
 * @internal Only exported to be used in higher-level Sentry packages
 * @hidden Only exported to be used in higher-level Sentry packages
 */
export function setAsyncLocalStorageAsyncContextStrategy(): void {
  if (installed) {
    return;
  }
  installed = true;

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
