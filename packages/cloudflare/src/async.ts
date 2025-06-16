// Need to use node: prefix for cloudflare workers compatibility
// Note: Because we are using node:async_hooks, we need to set `node_compat` in the wrangler.toml
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Scope } from '@sentry/core';
import { getDefaultCurrentScope, getDefaultIsolationScope, setAsyncContextStrategy } from '@sentry/core';

/**
 * Sets the async context strategy to use AsyncLocalStorage.
 *
 * AsyncLocalStorage is only available in the cloudflare workers runtime if you set
 * compatibility_flags = ["nodejs_compat"] or compatibility_flags = ["nodejs_als"]
 *
 * @internal Only exported to be used in higher-level Sentry packages
 * @hidden Only exported to be used in higher-level Sentry packages
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
