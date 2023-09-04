import type { Context } from '@opentelemetry/api';
import * as api from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import type { Carrier, Hub } from '@sentry/core';
import { ensureHubOnCarrier, getCurrentHub, getHubFromCarrier } from '@sentry/core';

export const OTEL_CONTEXT_HUB_KEY = api.createContextKey('sentry_hub');

function createNewHub(parent: Hub | undefined): Hub {
  const carrier: Carrier = {};
  ensureHubOnCarrier(carrier, parent);
  return getHubFromCarrier(carrier);
}

/**
 * This is a custom ContextManager for OpenTelemetry, which extends the default AsyncLocalStorageContextManager.
 * It ensures that we create a new hub per context, so that the OTEL Context & the Sentry Hub are always in sync.
 *
 * Note that we currently only support AsyncHooks with this,
 * but since this should work for Node 14+ anyhow that should be good enough.
 */
export class SentryContextManager extends AsyncLocalStorageContextManager {
  /**
   * Overwrite with() of the original AsyncLocalStorageContextManager
   * to ensure we also create a new hub per context.
   */
  public with<A extends unknown[], F extends (...args: A) => ReturnType<F>>(
    context: Context,
    fn: F,
    thisArg?: ThisParameterType<F>,
    ...args: A
  ): ReturnType<F> {
    const existingHub = getCurrentHub();
    const newHub = createNewHub(existingHub);

    return super.with(context.setValue(OTEL_CONTEXT_HUB_KEY, newHub), fn, thisArg, ...args);
  }
}
