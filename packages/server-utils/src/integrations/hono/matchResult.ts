import { isPlainObject } from '@sentry/core';
import type { MatchedHandler } from './honoTypes';

function isMatchedHandler(entry: unknown): entry is MatchedHandler {
  const pair: unknown = Array.isArray(entry) ? entry[0] : undefined;
  if (!Array.isArray(pair)) {
    return false;
  }

  const [handler, route]: unknown[] = pair;
  return (
    typeof handler === 'function' &&
    isPlainObject(route) &&
    typeof route.method === 'string' &&
    typeof route.path === 'string' &&
    typeof route.handler === 'function'
  );
}

/**
 * Checks the entry shape that `compose` and `hono/route` read. The match result is a Hono internal, so
 * the SDK leaves other shapes alone.
 */
export function isMatchedHandlerList(handlers: unknown): handlers is MatchedHandler[] {
  return Array.isArray(handlers) && handlers.every(isMatchedHandler);
}
