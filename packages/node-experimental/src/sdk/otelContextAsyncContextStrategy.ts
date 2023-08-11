import * as api from '@opentelemetry/api';
import type { Carrier, Hub, RunWithAsyncContextOptions } from '@sentry/core';
import { ensureHubOnCarrier, getHubFromCarrier, setAsyncContextStrategy } from '@sentry/core';

const hubKey = api.createContextKey('sentry_hub');

/**
 * Sets the async context strategy to use follow the OTEL context under the hood.
 */
export function setOtelContextAsyncContextStrategy(): void {
  function getCurrentHub(): Hub | undefined {
    const ctx = api.context.active();

    // Returning undefined means the global hub will be used
    return ctx.getValue(hubKey) as Hub | undefined;
  }

  function createNewHub(parent: Hub | undefined): Hub {
    const carrier: Carrier = {};
    ensureHubOnCarrier(carrier, parent);
    return getHubFromCarrier(carrier);
  }

  function runWithAsyncContext<T>(callback: () => T, options: RunWithAsyncContextOptions): T {
    const existingHub = getCurrentHub();

    if (existingHub && options?.reuseExisting) {
      // We're already in an async context, so we don't need to create a new one
      // just call the callback with the current hub
      return callback();
    }

    const newHub = createNewHub(existingHub);

    const ctx = api.context.active();

    return api.context.with(ctx.setValue(hubKey, newHub), () => {
      return callback();
    });
  }

  setAsyncContextStrategy({ getCurrentHub, runWithAsyncContext });
}
