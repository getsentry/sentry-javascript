// PUBLIC APIS

import { getCurrentScope } from '@sentry/core';
import type { Client } from '@sentry/types';

/** Get the currently active client. */
export function getClient<C extends Client>(): C {
  const currentScope = getCurrentScope();

  const client = currentScope.getClient();
  if (client) {
    return client as C;
  }

  // TODO otherwise ensure we use a noop client
  return {} as C;
}
