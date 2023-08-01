import { getCurrentHub } from '@sentry/core';
import type { Client } from '@sentry/types';
import { logger } from '@sentry/utils';

/**
 * Call `flush()` on the current client, if there is one. See {@link Client.flush}.
 *
 * @param timeout Maximum time in ms the client should wait to flush its event queue. Omitting this parameter will cause
 * the client to wait until all events are sent before resolving the promise.
 * @returns A promise which resolves to `true` if the queue successfully drains before the timeout, or `false` if it
 * doesn't (or if there's no client defined).
 */
export async function flush(timeout?: number): Promise<boolean> {
  const client = getCurrentHub().getClient<Client>();
  if (client) {
    return client.flush(timeout);
  }
  __DEBUG_BUILD__ && logger.warn('Cannot flush events. No client defined.');
  return Promise.resolve(false);
}
