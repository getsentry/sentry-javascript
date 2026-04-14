import type { AsyncLocalStorage } from 'node:async_hooks';
import type { Context, ContextManager } from '@opentelemetry/api';
import { SENTRY_SCOPES_CONTEXT_KEY } from './constants';
import { buildContextWithSentryScopes } from './utils/buildContextWithSentryScopes';
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
 *
 * @deprecated Use {@link SentryAsyncLocalStorageContextManager} instead.
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
      const ctx2 = buildContextWithSentryScopes(context, this.active());
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
