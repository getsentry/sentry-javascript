import type { Context } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { setHubOnContext } from '@sentry/opentelemetry';
import { getCurrentHub } from '../sdk/hub';

import { getCurrentScope, getIsolationScope } from './../sdk/api';
import { Scope } from './../sdk/scope';
import type { CurrentScopes } from './../sdk/types';
import { getScopesFromContext, setScopesOnContext } from './../utils/contextData';

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
    const previousScopes = getScopesFromContext(context);

    const currentScope = previousScopes ? previousScopes.scope : getCurrentScope();
    const isolationScope = previousScopes ? previousScopes.isolationScope : getIsolationScope();

    const newCurrentScope = currentScope.clone();
    const scopes: CurrentScopes = { scope: newCurrentScope, isolationScope };

    // We also need to "mock" the hub on the context, as the original @sentry/opentelemetry uses that...
    const mockHub = { ...getCurrentHub(), getScope: () => scopes.scope };

    const ctx1 = setHubOnContext(context, mockHub);
    const ctx2 = setScopesOnContext(ctx1, scopes);

    return super.with(ctx2, fn, thisArg, ...args);
  }
}
