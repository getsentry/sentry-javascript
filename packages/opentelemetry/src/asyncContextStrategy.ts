import * as api from '@opentelemetry/api';
import type { Scope, withActiveSpan as defaultWithActiveSpan } from '@sentry/core';
import { getDefaultCurrentScope, getDefaultIsolationScope, setAsyncContextStrategy } from '@sentry/core';
import {
  SENTRY_FORK_ISOLATION_SCOPE_CONTEXT_KEY,
  SENTRY_FORK_SET_ISOLATION_SCOPE_CONTEXT_KEY,
  SENTRY_FORK_SET_SCOPE_CONTEXT_KEY,
} from './constants';
import { continueTrace, startInactiveSpan, startNewTrace, startSpan, startSpanManual, withActiveSpan } from './trace';
import type { CurrentScopes } from './types';
import { getContextFromScope, getScopesFromContext } from './utils/contextData';
import { getActiveSpan } from './utils/getActiveSpan';
import { getTraceData } from './utils/getTraceData';
import { suppressTracing } from './utils/suppressTracing';
import { getAsyncLocalStorage } from './asyncLocalStorageContextManager';

interface ContextApi {
  _getContextManager():
    | undefined
    | {
        getAsyncLocalStorageLookup(): {
          asyncLocalStorage: unknown;
        };
      };
}

/**
 * Sets the async context strategy to use follow the OTEL context under the hood.
 * We handle forking a hub inside of our custom OTEL Context Manager (./otelContextManager.ts)
 */
export function setOpenTelemetryContextAsyncContextStrategy(options?: { skipOpenTelemetrySetup?: boolean }): void {
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

  setAsyncContextStrategy({
    withScope,
    withSetScope,
    withSetIsolationScope,
    withIsolationScope,
    getCurrentScope,
    getIsolationScope,
    startSpan,
    startSpanManual,
    startInactiveSpan,
    getActiveSpan,
    suppressTracing,
    getTraceData,
    continueTrace,
    startNewTrace,
    // The types here don't fully align, because our own `Span` type is narrower
    // than the OTEL one - but this is OK for here, as we now we'll only have OTEL spans passed around
    withActiveSpan: withActiveSpan as typeof defaultWithActiveSpan,
    getTracingChannelBinding: () => {
      // Default case: by default we can just access the async local storage instance here
      // this will work no matter if this called before or after the Otel ContextManager was setup
      if (!options?.skipOpenTelemetrySetup) {
        const asyncLocalStorage = getAsyncLocalStorage();

        return {
          asyncLocalStorage,
          getStoreWithActiveSpan: span => api.trace.setSpan(api.context.active(), span),
        };
      }

      // Else, if we have a custom context manager, we need to access it via the context manager
      // this may not be available yet, if this is called before the Otel ContextManager was setup
      // in this case, we need to return undefined and retry later, hoping that the setup works by then
      try {
        const contextManager = (api.context as unknown as ContextApi)._getContextManager();
        const asyncLocalStorage = contextManager?.getAsyncLocalStorageLookup().asyncLocalStorage;

        return {
          asyncLocalStorage,
          getStoreWithActiveSpan: span => api.trace.setSpan(api.context.active(), span as api.Span),
        };
      } catch {
        return undefined;
      }
    },
  });
}
