import type { AsyncLocalStorage } from 'node:async_hooks';
import type { Context, ContextManager } from '@opentelemetry/api';
import { trace } from '@opentelemetry/api';
import type { Scope } from '@sentry/core';
import { getCurrentScope, getIsolationScope } from '@sentry/core';
import {
  SENTRY_FORK_ISOLATION_SCOPE_CONTEXT_KEY,
  SENTRY_FORK_SET_ISOLATION_SCOPE_CONTEXT_KEY,
  SENTRY_FORK_SET_SCOPE_CONTEXT_KEY,
  SENTRY_SCOPES_CONTEXT_KEY,
  SENTRY_TRACE_STATE_CHILD_IGNORED,
} from './constants';
import { getScopesFromContext, setContextOnScope, setScopesOnContext } from './utils/contextData';
import { setIsSetup } from './utils/setupCheck';

export type AsyncLocalStorageLookup = {
  asyncLocalStorage: AsyncLocalStorage<unknown>;
  contextSymbol: symbol;
};

type ExtendedContextManagerInstance<ContextManagerInstance extends ContextManager> = new (
  ...args: unknown[]
) => ContextManagerInstance & {
  getAsyncLocalStorageLookup(): AsyncLocalStorageLookup;
};

/**
 * Wrap an OpenTelemetry ContextManager in a way that ensures the context is kept in sync with the Sentry Scope.
 *
 * Usage:
 * import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
 * const SentryContextManager = wrapContextManagerClass(AsyncLocalStorageContextManager);
 * const contextManager = new SentryContextManager();
 */
export function wrapContextManagerClass<ContextManagerInstance extends ContextManager>(
  ContextManagerClass: new (...args: unknown[]) => ContextManagerInstance,
): ExtendedContextManagerInstance<ContextManagerInstance> {
  /**
   * This is a custom ContextManager for OpenTelemetry, which extends the default AsyncLocalStorageContextManager.
   * It ensures that we create new scopes per context, so that the OTEL Context & the Sentry Scope are always in sync.
   *
   * Note that we currently only support AsyncHooks with this,
   * but since this should work for Node 14+ anyhow that should be good enough.
   */

  // @ts-expect-error TS does not like this, but we know this is fine
  class SentryContextManager extends ContextManagerClass {
    public constructor(...args: unknown[]) {
      super(...args);
      setIsSetup('SentryContextManager');
    }
    /**
     * Overwrite with() of the original AsyncLocalStorageContextManager
     * to ensure we also create new scopes per context.
     */
    public with<A extends unknown[], F extends (...args: A) => ReturnType<F>>(
      context: Context,
      fn: F,
      thisArg?: ThisParameterType<F>,
      ...args: A
    ): ReturnType<F> {
      // Remove ignored spans from context and restore the parent span so children
      // naturally parent to the grandparent instead of starting a new trace.
      // At this point, this.active() still holds the outer context (before super.with()
      // updates AsyncLocalStorage), which has the grandparent span we want to restore.
      const span = trace.getSpan(context);
      let effectiveContext: Context;
      if (span?.spanContext().traceState?.get(SENTRY_TRACE_STATE_CHILD_IGNORED) === '1') {
        const contextWithoutSpan = trace.deleteSpan(context);
        const parentSpan = trace.getSpan(this.active());
        effectiveContext = parentSpan ? trace.setSpan(contextWithoutSpan, parentSpan) : contextWithoutSpan;
      } else {
        effectiveContext = context;
      }

      const currentScopes = getScopesFromContext(effectiveContext);
      const currentScope = currentScopes?.scope || getCurrentScope();
      const currentIsolationScope = currentScopes?.isolationScope || getIsolationScope();

      const shouldForkIsolationScope = effectiveContext.getValue(SENTRY_FORK_ISOLATION_SCOPE_CONTEXT_KEY) === true;
      const scope = effectiveContext.getValue(SENTRY_FORK_SET_SCOPE_CONTEXT_KEY) as Scope | undefined;
      const isolationScope = effectiveContext.getValue(SENTRY_FORK_SET_ISOLATION_SCOPE_CONTEXT_KEY) as
        | Scope
        | undefined;

      const newCurrentScope = scope || currentScope.clone();
      const newIsolationScope =
        isolationScope || (shouldForkIsolationScope ? currentIsolationScope.clone() : currentIsolationScope);
      const scopes = { scope: newCurrentScope, isolationScope: newIsolationScope };

      const ctx1 = setScopesOnContext(effectiveContext, scopes);

      // Remove the unneeded values again
      const ctx2 = ctx1
        .deleteValue(SENTRY_FORK_ISOLATION_SCOPE_CONTEXT_KEY)
        .deleteValue(SENTRY_FORK_SET_SCOPE_CONTEXT_KEY)
        .deleteValue(SENTRY_FORK_SET_ISOLATION_SCOPE_CONTEXT_KEY);

      setContextOnScope(newCurrentScope, ctx2);

      return super.with(ctx2, fn, thisArg, ...args);
    }

    /**
     * Gets underlying AsyncLocalStorage and symbol to allow lookup of scope.
     */
    public getAsyncLocalStorageLookup(): AsyncLocalStorageLookup {
      return {
        // @ts-expect-error This is on the base class, but not part of the interface
        asyncLocalStorage: this._asyncLocalStorage,
        contextSymbol: SENTRY_SCOPES_CONTEXT_KEY,
      };
    }
  }

  return SentryContextManager as unknown as ExtendedContextManagerInstance<ContextManagerInstance>;
}
