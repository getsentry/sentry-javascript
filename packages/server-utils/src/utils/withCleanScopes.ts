import type { Scope } from '@sentry/core';
import { getClient, getDefaultCurrentScope, withIsolationScope, withScope } from '@sentry/core';

/**
 * Run `callback` with `isolationScope` and a fresh copy of the default current scope. For work that
 * a library schedules from whichever async context last woke it: a forked scope would carry over the
 * data of that context, such as the conversation id of another run. Only the client of that context
 * is kept, because an SDK that initializes inside each request, such as `@sentry/cloudflare`, binds
 * it to the request's scope alone.
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
