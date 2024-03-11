import type { Context, ContextManager } from '@opentelemetry/api';
import { getCurrentScope, getIsolationScope } from '@sentry/core';
import type { Scope } from '@sentry/types';

import {
  SENTRY_FORK_ISOLATION_SCOPE_CONTEXT_KEY,
  SENTRY_FORK_SET_ISOLATION_SCOPE_CONTEXT_KEY,
  SENTRY_FORK_SET_SCOPE_CONTEXT_KEY,
} from './constants';
import { getScopesFromContext, setContextOnScope, setScopesOnContext } from './utils/contextData';
import { setIsSetup } from './utils/setupCheck';

/**
 * Wrap an OpenTelemetry ContextManager in a way that ensures the context is kept in sync with the Sentry Hub.
 *
 * Usage:
 * import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
 * const SentryContextManager = wrapContextManagerClass(AsyncLocalStorageContextManager);
 * const contextManager = new SentryContextManager();
 */
export function wrapContextManagerClass<ContextManagerInstance extends ContextManager>(
  ContextManagerClass: new (...args: unknown[]) => ContextManagerInstance,
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
    public constructor() {
      super();
      setIsSetup('SentryContextManager');
    }
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
      const currentScopes = getScopesFromContext(context);
      const currentScope = currentScopes?.scope || getCurrentScope();
      const currentIsolationScope = currentScopes?.isolationScope || getIsolationScope();

      const shouldForkIsolationScope = context.getValue(SENTRY_FORK_ISOLATION_SCOPE_CONTEXT_KEY) === true;
      const scope = context.getValue(SENTRY_FORK_SET_SCOPE_CONTEXT_KEY) as Scope | undefined;
      const isolationScope = context.getValue(SENTRY_FORK_SET_ISOLATION_SCOPE_CONTEXT_KEY) as Scope | undefined;

      const newCurrentScope = scope || currentScope.clone();
      const newIsolationScope =
        isolationScope || (shouldForkIsolationScope ? currentIsolationScope.clone() : currentIsolationScope);
      const scopes = { scope: newCurrentScope, isolationScope: newIsolationScope };

      const ctx1 = setScopesOnContext(context, scopes);

      // Remove the unneeded values again
      const ctx2 = ctx1
        .deleteValue(SENTRY_FORK_ISOLATION_SCOPE_CONTEXT_KEY)
        .deleteValue(SENTRY_FORK_SET_SCOPE_CONTEXT_KEY)
        .deleteValue(SENTRY_FORK_SET_ISOLATION_SCOPE_CONTEXT_KEY);

      setContextOnScope(newCurrentScope, ctx2);

      return super.with(ctx2, fn, thisArg, ...args);
    }
  }

  return SentryContextManager as unknown as typeof ContextManagerClass;
}
