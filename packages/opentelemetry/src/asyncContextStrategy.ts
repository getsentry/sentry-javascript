import * as api from '@opentelemetry/api';
import type { Hub } from '@sentry/core';
import { setAsyncContextStrategy } from '@sentry/core';
import { SENTRY_FORK_ISOLATION_SCOPE_CONTEXT_KEY } from './constants';

import { getHubFromContext } from './utils/contextData';

/**
 * Sets the async context strategy to use follow the OTEL context under the hood.
 * We handle forking a hub inside of our custom OTEL Context Manager (./otelContextManager.ts)
 */
export function setOpenTelemetryContextAsyncContextStrategy(): void {
  function getCurrentHub(): Hub | undefined {
    const ctx = api.context.active();

    // Returning undefined means the global hub will be used
    // Need to cast from @sentry/type's `Hub` to @sentry/core's `Hub`
    return getHubFromContext(ctx) as Hub | undefined;
  }

  /* This is more or less a NOOP - we rely on the OTEL context manager for this */
  function runWithAsyncContext<T>(callback: () => T): T {
    const ctx = api.context.active();

    // We depend on the otelContextManager to handle the context/hub
    // We set the `SENTRY_FORK_ISOLATION_SCOPE_CONTEXT_KEY` context value, which is picked up by
    // the OTEL context manager, which uses the presence of this key to determine if it should
    // fork the isolation scope, or not
    // as by default, we don't want to fork this, unless triggered explicitly by `runWithAsyncContext`
    return api.context.with(ctx.setValue(SENTRY_FORK_ISOLATION_SCOPE_CONTEXT_KEY, true), () => {
      return callback();
    });
  }

  setAsyncContextStrategy({ getCurrentHub, runWithAsyncContext });
}
