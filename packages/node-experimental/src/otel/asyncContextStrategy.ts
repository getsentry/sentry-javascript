import * as api from '@opentelemetry/api';

import { setAsyncContextStrategy } from './../sdk/globals';
import { getCurrentHub } from './../sdk/hub';
import type { CurrentScopes } from './../sdk/types';
import { getScopesFromContext } from './../utils/contextData';

/**
 * Sets the async context strategy to use follow the OTEL context under the hood.
 * We handle forking a hub inside of our custom OTEL Context Manager (./otelContextManager.ts)
 */
export function setOpenTelemetryContextAsyncContextStrategy(): void {
  function getScopes(): CurrentScopes | undefined {
    const ctx = api.context.active();
    return getScopesFromContext(ctx);
  }

  /* This is more or less a NOOP - we rely on the OTEL context manager for this */
  function runWithAsyncContext<T>(callback: () => T): T {
    const ctx = api.context.active();

    // We depend on the otelContextManager to handle the context/hub
    return api.context.with(ctx, () => {
      return callback();
    });
  }

  setAsyncContextStrategy({ getScopes, getCurrentHub, runWithAsyncContext });
}
