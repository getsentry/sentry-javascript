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

/** TODO docs */
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
