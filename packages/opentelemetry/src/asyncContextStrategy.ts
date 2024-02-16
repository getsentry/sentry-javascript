import * as api from '@opentelemetry/api';
import { getGlobalHub } from '@sentry/core';
import { setAsyncContextStrategy } from '@sentry/core';
import type { Hub, Scope } from '@sentry/types';
import {
  SENTRY_FORK_ISOLATION_SCOPE_CONTEXT_KEY,
  SENTRY_FORK_SET_ISOLATION_SCOPE_CONTEXT_KEY,
  SENTRY_FORK_SET_SCOPE_CONTEXT_KEY,
} from './constants';

import { getHubFromContext } from './utils/contextData';

/**
 * Sets the async context strategy to use follow the OTEL context under the hood.
 * We handle forking a hub inside of our custom OTEL Context Manager (./otelContextManager.ts)
 */
export function setOpenTelemetryContextAsyncContextStrategy(): void {
  function getCurrentFromContext(): Hub | undefined {
    const ctx = api.context.active();

    // Returning undefined means the global hub will be used
    // Need to cast from @sentry/type's `Hub` to @sentry/core's `Hub`
    return getHubFromContext(ctx) as Hub | undefined;
  }

  function getCurrentHub(): Hub {
    return getCurrentFromContext() || getGlobalHub();
  }

  function withScope<T>(callback: (scope: Scope) => T): T {
    const ctx = api.context.active();

    // We depend on the otelContextManager to handle the context/hub
    // We set the `SENTRY_FORK_ISOLATION_SCOPE_CONTEXT_KEY` context value, which is picked up by
    // the OTEL context manager, which uses the presence of this key to determine if it should
    // fork the isolation scope, or not
    // as by default, we don't want to fork this, unless triggered explicitly by `runWithAsyncContext`
    return api.context.with(ctx, () => {
      // eslint-disable-next-line deprecation/deprecation
      return callback(getCurrentHub().getScope());
    });
  }

  function withSetScope<T>(scope: Scope, callback: (scope: Scope) => T): T {
    const ctx = api.context.active();

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
      // eslint-disable-next-line deprecation/deprecation
      return callback(getCurrentHub().getIsolationScope());
    });
  }

  function withSetIsolationScope<T>(isolationScope: Scope, callback: (isolationScope: Scope) => T): T {
    const ctx = api.context.active();

    // We depend on the otelContextManager to handle the context/hub
    // We set the `SENTRY_FORK_ISOLATION_SCOPE_CONTEXT_KEY` context value, which is picked up by
    // the OTEL context manager, which uses the presence of this key to determine if it should
    // fork the isolation scope, or not
    return api.context.with(ctx.setValue(SENTRY_FORK_SET_ISOLATION_SCOPE_CONTEXT_KEY, isolationScope), () => {
      // eslint-disable-next-line deprecation/deprecation
      return callback(getCurrentHub().getIsolationScope());
    });
  }

  setAsyncContextStrategy({
    getCurrentHub,
    withScope,
    withSetScope,
    withIsolationScope,
    withSetIsolationScope,
    // eslint-disable-next-line deprecation/deprecation
    getCurrentScope: () => getCurrentHub().getScope(),
    // eslint-disable-next-line deprecation/deprecation
    getIsolationScope: () => getCurrentHub().getIsolationScope(),
  });
}
