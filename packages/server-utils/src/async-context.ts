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
  isContinuingTrace,
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

  // The isolation scope is shared, not forked, matching `withScope` above and the OpenTelemetry
  // strategy. Forking it would silently discard `setUser`/`setTag`/`setContext` calls made inside
  // the callback, as those write to the isolation scope.
  function withSetScope<T>(scope: Scope, callback: (scope: Scope) => T): T {
    const isolationScope = getScopes().isolationScope;
    return asyncStorage.run({ scope, isolationScope }, () => {
      return callback(scope);
    });
  }

  // The current scope is forked alongside the isolation scope, matching the OpenTelemetry strategy
  // (`buildContextWithSentryScopes` clones it on every fork). Sharing it by reference would let
  // current-scope mutations inside the callback leak back out to the caller.
  function withIsolationScope<T>(callback: (isolationScope: Scope) => T): T {
    const scope = getScopes().scope.clone();
    const isolationScope = getScopes().isolationScope.clone();

    // When forking an isolation scope, unless we are continuing an incoming
    // trace, we give the freshly forked scope its own trace. This way, new
    // root spans in an isolation scope will get separate traces. The previous
    // trace's `sampled` and `propagationSpanId` are dropped on purpose.
    // Carrying them over would apply the old trace's sampling decision to the
    // new one and propagate a span id from a different trace.
    if (!isContinuingTrace(scope.getPropagationContext())) {
      scope.setPropagationContext({
        traceId: generateTraceId(),
        sampleRand: _INTERNAL_safeMathRandom(),
      });
    }

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
