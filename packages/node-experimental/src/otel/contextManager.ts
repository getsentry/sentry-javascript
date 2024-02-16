import type { Context } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { getCurrentScope, getIsolationScope } from '@sentry/core';
import { setHubOnContext } from '@sentry/opentelemetry';
import type { Scope } from '@sentry/types';
import { getCurrentHub } from '../sdk/hub';

import type { CurrentScopes } from './../sdk/types';
import {
  SENTRY_FORK_ISOLATION_SCOPE_CONTEXT_KEY,
  SENTRY_FORK_SET_ISOLATION_SCOPE_CONTEXT_KEY,
  SENTRY_FORK_SET_SCOPE_CONTEXT_KEY,
  getScopesFromContext,
  setScopesOnContext,
} from './../utils/contextData';

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
    const currentScopes = getScopesFromContext(context);
    const currentScope = currentScopes?.scope || getCurrentScope();
    const currentIsolationScope = currentScopes?.isolationScope || getIsolationScope();

    const shouldForkIsolationScope = context.getValue(SENTRY_FORK_ISOLATION_SCOPE_CONTEXT_KEY) === true;
    const scope = context.getValue(SENTRY_FORK_SET_SCOPE_CONTEXT_KEY) as Scope | undefined;
    const isolationScope = context.getValue(SENTRY_FORK_SET_ISOLATION_SCOPE_CONTEXT_KEY) as Scope | undefined;

    const newCurrentScope = scope || currentScope.clone();
    const newIsolationScope =
      isolationScope || (shouldForkIsolationScope ? currentIsolationScope.clone() : currentIsolationScope);
    const scopes: CurrentScopes = { scope: newCurrentScope, isolationScope: newIsolationScope };

    const mockHub = {
      // eslint-disable-next-line deprecation/deprecation
      ...getCurrentHub(),
      getScope: () => newCurrentScope,
      getIsolationScope: () => newIsolationScope,
    };

    const ctx1 = setHubOnContext(context, mockHub);
    const ctx2 = setScopesOnContext(ctx1, scopes);

    // Remove the unneeded values again
    const ctx3 = ctx2
      .deleteValue(SENTRY_FORK_ISOLATION_SCOPE_CONTEXT_KEY)
      .deleteValue(SENTRY_FORK_SET_SCOPE_CONTEXT_KEY)
      .deleteValue(SENTRY_FORK_SET_ISOLATION_SCOPE_CONTEXT_KEY);

    return super.with(ctx3, fn, thisArg, ...args);
  }
}
