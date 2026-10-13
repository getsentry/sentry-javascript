import type { Context } from '@opentelemetry/api';
import type { Scope } from '@sentry/core';
import { getCurrentScope, getIsolationScope } from '@sentry/core';
import {
  SENTRY_FORK_ISOLATION_SCOPE_CONTEXT_KEY,
  SENTRY_FORK_SET_ISOLATION_SCOPE_CONTEXT_KEY,
  SENTRY_FORK_SET_SCOPE_CONTEXT_KEY,
} from '../constants';
import { getScopesFromContext, setContextOnScope, setScopesOnContext } from './contextData';

/**
 * Merge Sentry scopes into an OpenTelemetry {@link Context} and apply trace-context adjustments
 * used by Sentry OpenTelemetry context manager(s).
 *
 * @param context - Context passed into `ContextManager.with`.
 * @param activeContext - Context that was active before entering `with` (e.g. `this.active()`), used
 *   to restore the parent span when the incoming span is marked ignored for children.
 * @returns A new context ready for `super.with` / `AsyncLocalStorage.run`.
 */
export function buildContextWithSentryScopes(context: Context): Context {
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

  const ctx2 = ctx1
    .deleteValue(SENTRY_FORK_ISOLATION_SCOPE_CONTEXT_KEY)
    .deleteValue(SENTRY_FORK_SET_SCOPE_CONTEXT_KEY)
    .deleteValue(SENTRY_FORK_SET_ISOLATION_SCOPE_CONTEXT_KEY);

  setContextOnScope(newCurrentScope, ctx2);

  return ctx2;
}
