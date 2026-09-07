import { AsyncLocalStorage } from 'node:async_hooks';
import type { Scope } from '@sentry/core';
import {
  _INTERNAL_createTracingChannelBinding,
  _INTERNAL_safeMathRandom,
  generateTraceId,
  getDefaultCurrentScope,
  getDefaultIsolationScope,
  isContinuingTrace,
  setAsyncContextStrategy,
  SUPPRESS_TRACING_KEY,
} from '@sentry/core';

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

  // In contrast to the browser, we can rely on async context isolation here
  function suppressTracing<T>(callback: () => T): T {
    return withScope(scope => {
      scope.setSDKProcessingMetadata({ [SUPPRESS_TRACING_KEY]: true });
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
    getTracingChannelBinding: () => _INTERNAL_createTracingChannelBinding(asyncStorage, getScopes),
  });
}
