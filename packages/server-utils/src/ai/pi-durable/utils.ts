import type { Scope } from '@sentry/core';
import { getClient, getDefaultCurrentScope, withIsolationScope, withScope } from '@sentry/core';

/** Read a member with `this` bound to the original, so getters and methods that use `this` keep working. */
export function bound(target: object, property: PropertyKey): unknown {
  const value: unknown = Reflect.get(target, property, target);
  return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
}

/**
 * Run `callback` with `isolationScope` and a fresh copy of the default current scope. A forked
 * scope would carry over the data of whatever async context last woke the scheduler, such as
 * another conversation's id. Only the client of that context is kept: an SDK that initializes
 * inside each request, such as `@sentry/cloudflare`, binds it to the request's scope alone.
 */
export function withCleanScopes<T>(isolationScope: Scope, callback: () => T): T {
  const client = getClient();
  return withIsolationScope(isolationScope, () => {
    const scope = getDefaultCurrentScope().clone();
    if (client) {
      scope.setClient(client);
    }
    return withScope(scope, callback);
  });
}
