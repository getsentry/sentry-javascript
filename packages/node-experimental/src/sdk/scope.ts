import { Scope as ScopeClass, getGlobalScope } from '@sentry/core';
import type { Client } from '@sentry/types';
import type { Scope } from '@sentry/types';

import { getGlobalCarrier } from './globals';
import type { CurrentScopes, SentryCarrier } from './types';

/** Get the current scope. */
export function getCurrentScope(): Scope {
  return getScopes().scope as Scope;
}

/**
 * Set the current scope on the execution context.
 * This should mostly only be called in Sentry.init()
 */
export function setCurrentScope(scope: Scope): void {
  getScopes().scope = scope;
}

/** Get the currently active isolation scope. */
export function getIsolationScope(): Scope {
  return getScopes().isolationScope as Scope;
}

/**
 * Set the currently active isolation scope.
 * Use this with caution! As it updates the isolation scope for the current execution context.
 */
export function setIsolationScope(isolationScope: Scope): void {
  getScopes().isolationScope = isolationScope;
}

/** Get the currently active client. */
export function getClient<C extends Client>(): C {
  const currentScope = getCurrentScope();
  const isolationScope = getIsolationScope();
  const globalScope = getGlobalScope();

  const client = currentScope.getClient() || isolationScope.getClient() || globalScope.getClient();
  if (client) {
    return client as C;
  }

  // TODO otherwise ensure we use a noop client
  return {} as C;
}

function getScopes(): CurrentScopes {
  const carrier = getGlobalCarrier();

  if (carrier.acs && carrier.acs.getScopes) {
    const scopes = carrier.acs.getScopes();

    if (scopes) {
      return scopes;
    }
  }

  return getGlobalCurrentScopes(carrier);
}

function getGlobalCurrentScopes(carrier: SentryCarrier): CurrentScopes {
  if (!carrier.scopes) {
    carrier.scopes = {
      scope: new ScopeClass(),
      isolationScope: new ScopeClass(),
    };
  }

  return carrier.scopes;
}
