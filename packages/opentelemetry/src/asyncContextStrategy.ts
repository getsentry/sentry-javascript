import * as api from '@opentelemetry/api';
import type { Scope, TracingChannelBinding } from '@sentry/core';
import {
  getAsyncContextStrategy,
  _INTERNAL_safeMathRandom,
  generateTraceId,
  getDefaultCurrentScope,
  getDefaultIsolationScope,
  getMainCarrier,
  isContinuingTrace,
  setAsyncContextStrategy,
} from '@sentry/core';
import {
  SENTRY_FORK_ISOLATION_SCOPE_CONTEXT_KEY,
  SENTRY_FORK_SET_ISOLATION_SCOPE_CONTEXT_KEY,
  SENTRY_FORK_SET_SCOPE_CONTEXT_KEY,
} from './constants';
import { withActiveSpan } from './trace';
import type { CurrentScopes } from './types';
import { getContextFromScope, getScopesFromContext } from './utils/contextData';
import { getActiveSpan } from './utils/getActiveSpan';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { AsyncLocalStorageLookup } from './asyncLocalStorageContextManager';
import { SentryAsyncLocalStorageContextManager } from './asyncLocalStorageContextManager';

/**
 * Sets the async context strategy to use follow the OTEL context under the hood.
 * We handle forking a hub inside of our custom OTEL Context Manager (./otelContextManager.ts)
 */
export function setOpenTelemetryContextAsyncContextStrategy(): AsyncLocalStorageLookup {
  // Re-use the AsyncLocalStorage of an already-installed strategy, if any. Otherwise a repeated
  // setup would swap in a new store while integrations that captured the previous one (via
  // `getTracingChannelBinding().asyncLocalStorage`) keep reading the old one, breaking scope
  // propagation across async boundaries.
  const existingAsyncLocalStorage = getAsyncContextStrategy(getMainCarrier()).getTracingChannelBinding?.()
    ?.asyncLocalStorage as AsyncLocalStorage<api.Context> | undefined;

  const asyncLocalStorage = existingAsyncLocalStorage ?? new AsyncLocalStorage<api.Context>();

  function getScopes(): CurrentScopes {
    const ctx = api.context.active();
    const scopes = getScopesFromContext(ctx);

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
    const ctx = api.context.active();

    // We depend on the otelContextManager to handle the context/hub
    // We set the `SENTRY_FORK_ISOLATION_SCOPE_CONTEXT_KEY` context value, which is picked up by
    // the OTEL context manager, which uses the presence of this key to determine if it should
    // fork the isolation scope, or not
    // as by default, we don't want to fork this, unless triggered explicitly by `withScope`
    return api.context.with(ctx, () => {
      return callback(getCurrentScope());
    });
  }

  function withSetScope<T>(scope: Scope, callback: (scope: Scope) => T): T {
    const ctx = getContextFromScope(scope) || api.context.active();

    // We depend on the otelContextManager to handle the context/hub
    // We set the `SENTRY_FORK_SET_SCOPE_CONTEXT_KEY` context value, which is picked up by
    // the OTEL context manager, which picks up this scope as the current scope
    return api.context.with(ctx.setValue(SENTRY_FORK_SET_SCOPE_CONTEXT_KEY, scope), () => {
      return callback(scope);
    });
  }

  function withIsolationScope<T>(callback: (isolationScope: Scope) => T): T {
    const ctx = api.context.active();

    // We depend on the otelContextManager to handle the context/hub
    // We set the `SENTRY_FORK_ISOLATION_SCOPE_CONTEXT_KEY` context value, which is picked up by
    // the OTEL context manager, which uses the presence of this key to determine if it should
    // fork the isolation scope, or not
    return api.context.with(ctx.setValue(SENTRY_FORK_ISOLATION_SCOPE_CONTEXT_KEY, true), () => {
      // When forking an isolation scope, unless we are continuing an incoming
      // trace, we give the freshly forked scope its own trace. This way, new
      // root spans in an isolation scope will get separate traces. The
      // previous trace's `sampled` and `propagationSpanId` are dropped on
      // purpose. Carrying them over would apply the old trace's sampling
      // decision to the new one and propagate a span id from a different trace.
      const scope = getCurrentScope();
      if (!isContinuingTrace(scope.getPropagationContext())) {
        scope.setPropagationContext({
          traceId: generateTraceId(),
          sampleRand: _INTERNAL_safeMathRandom(),
        });
      }
      return callback(getIsolationScope());
    });
  }

  function withSetIsolationScope<T>(isolationScope: Scope, callback: (isolationScope: Scope) => T): T {
    const ctx = api.context.active();

    // We depend on the otelContextManager to handle the context/hub
    // We set the `SENTRY_FORK_ISOLATION_SCOPE_CONTEXT_KEY` context value, which is picked up by
    // the OTEL context manager, which uses the presence of this key to determine if it should
    // fork the isolation scope, or not
    return api.context.with(ctx.setValue(SENTRY_FORK_SET_ISOLATION_SCOPE_CONTEXT_KEY, isolationScope), () => {
      return callback(getIsolationScope());
    });
  }

  function getCurrentScope(): Scope {
    return getScopes().scope;
  }

  function getIsolationScope(): Scope {
    return getScopes().isolationScope;
  }

  function getTracingChannelBinding(): TracingChannelBinding {
    return {
      asyncLocalStorage,
    };
  }

  setAsyncContextStrategy({
    withScope,
    withSetScope,
    withSetIsolationScope,
    withIsolationScope,
    getCurrentScope,
    getIsolationScope,
    getActiveSpan,
    // The types here don't fully align, because our own `Span` type is narrower
    // than the OTEL one - but this is OK for here, as we now we'll only have OTEL spans passed around
    withActiveSpan: withActiveSpan,
    getTracingChannelBinding,
  });

  const ctxManager = new SentryAsyncLocalStorageContextManager(asyncLocalStorage);
  api.context.setGlobalContextManager(ctxManager);

  return ctxManager.getAsyncLocalStorageLookup();
}
