import { AsyncLocalStorage } from 'node:async_hooks';
import type { Scope } from '@sentry/core';
import {
  _INTERNAL_createTracingChannelBinding,
  getAsyncContextStrategy,
  _INTERNAL_safeMathRandom,
  generateTraceId,
  getDefaultCurrentScope,
  getDefaultIsolationScope,
  getMainCarrier,
  setAsyncContextStrategy,
} from '@sentry/core';

type ScopeStore = { scope: Scope; isolationScope: Scope };

/**
 * Sets the async context strategy to use AsyncLocalStorage.
 */
export function setAsyncLocalStorageAsyncContextStrategy(): void {
  // Re-use the AsyncLocalStorage of an already-installed strategy, if any. Otherwise a repeated
  // setup (e.g. a second `Sentry.init()`) would swap in a new store while integrations that captured
  // the previous one (via `getTracingChannelBinding().asyncLocalStorage`) keep reading the old one,
  // breaking scope propagation across async boundaries.
  const existingAsyncStorage = getAsyncContextStrategy(getMainCarrier()).getTracingChannelBinding?.()
    ?.asyncLocalStorage as AsyncLocalStorage<ScopeStore> | undefined;

  const asyncStorage = existingAsyncStorage ?? new AsyncLocalStorage<ScopeStore>();

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

    // When forking an isolation scope, unless we are continuing an incoming trace (identified by a `parentSpanId`),
    // we give the freshly forked scope its own trace.
    // This way, new root spans in an isolation scope will get separate traces.
    const propagationContext = scope.getPropagationContext();
    if (!propagationContext.parentSpanId) {
      scope.setPropagationContext({
        ...propagationContext,
        traceId: generateTraceId(),
        sampleRand: _INTERNAL_safeMathRandom(),
      });
    }

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
    withScope,
    withSetScope,
    withIsolationScope,
    withSetIsolationScope,
    getCurrentScope: () => getScopes().scope,
    getIsolationScope: () => getScopes().isolationScope,
    getTracingChannelBinding: () => _INTERNAL_createTracingChannelBinding(asyncStorage, getScopes),
  });
}
