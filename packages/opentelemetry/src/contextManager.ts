import type { Context, ContextManager } from '@opentelemetry/api';
import { trace } from '@opentelemetry/api';
import type { Carrier, Hub } from '@sentry/core';

import { ensureHubOnCarrier, getCurrentHub, getHubFromCarrier, isGlobalHub } from './custom/hub';
import {
  clearForceRootScopeOnContext,
  getForceRootScopeFromContext,
  setHubOnContext,
  setRootScopeOnContext,
} from './utils/contextData';
import { getActiveSpan } from './utils/getActiveSpan';

function createNewHub(parent: Hub | undefined): Hub {
  const carrier: Carrier = {};
  ensureHubOnCarrier(carrier, parent);
  return getHubFromCarrier(carrier);
}

// Typescript complains if we do not use `...args: any[]` for the mixin, with:
// A mixin class must have a constructor with a single rest parameter of type 'any[]'.ts(2545)
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Wrap an OpenTelemetry ContextManager in a way that ensures the context is kept in sync with the Sentry Hub.
 *
 * Usage:
 * import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
 * const SentryContextManager = wrapContextManagerClass(AsyncLocalStorageContextManager);
 * const contextManager = new SentryContextManager();
 */
export function wrapContextManagerClass<ContextManagerInstance extends ContextManager>(
  ContextManagerClass: new (...args: any[]) => ContextManagerInstance,
): typeof ContextManagerClass {
  /**
   * This is a custom ContextManager for OpenTelemetry, which extends the default AsyncLocalStorageContextManager.
   * It ensures that we create a new hub per context, so that the OTEL Context & the Sentry Hub are always in sync.
   *
   * Note that we currently only support AsyncHooks with this,
   * but since this should work for Node 14+ anyhow that should be good enough.
   */

  // @ts-expect-error TS does not like this, but we know this is fine
  class SentryContextManager extends ContextManagerClass {
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

      const hadActiveSpanBefore = !!getActiveSpan();
      const hasActiveSpan = !!trace.getSpan(context);
      const isRootSpan = hasActiveSpan && !hadActiveSpanBefore;

      const forceRootScope = getForceRootScopeFromContext(context);

      let ctx = setHubOnContext(context, newHub);

      // If this is the root of the execution context, we store the root scope for later reference
      if (isGlobalHub(existingHub) || forceRootScope || isRootSpan) {
        const scope = newHub.getScope();
        ctx = setRootScopeOnContext(ctx, scope);

        if (forceRootScope) {
          ctx = clearForceRootScopeOnContext(ctx);
        }
      }

      return super.with(ctx, fn, thisArg, ...args);
    }
  }

  return SentryContextManager as unknown as typeof ContextManagerClass;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
