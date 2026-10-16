import { addNonEnumerableProperty, isPlainObject } from '@sentry/core';
import type { Context, HonoRoute, MatchedHandler } from './honoTypes';
import { getMiddlewareFlags } from './isMiddleware';

// The `routeIndex` of the last route handler that started for a request, stored on its `Context`.
// `Symbol.for` so that every copy of `@sentry/server-utils` reads the index that another copy recorded.
const ROUTE_HANDLER_INDEX = Symbol.for('sentry.hono.routeHandlerIndex');

// Marks the wrapper that records `ROUTE_HANDLER_INDEX`. The router returns the same cached match
// result for each request to a route, so this keeps every copy of `@sentry/server-utils` from wrapping
// a handler twice. A span wrapper does not count: a route handler that `app.use()` wrapped for a span
// must still record its index.
const RECORDS_ROUTE_HANDLER_INDEX = Symbol.for('sentry.hono.recordsRouteHandlerIndex');

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

/**
 * Reads the request's match result through the getter that `hono/route` uses (Hono 4.8+ and Hono 5).
 * Its key is an unregistered `Symbol()` that `hono` does not export, so the getter is found by its
 * shape: it is the only symbol-keyed getter on the `HonoRequest` prototype.
 */
export function getMatchedHandlers(context: Context): MatchedHandler[] | undefined {
  const requestProto: object | null = Object.getPrototypeOf(context.req);
  if (!requestProto) {
    return undefined;
  }

  const [getterKey, ...otherGetterKeys] = Object.getOwnPropertySymbols(requestProto).filter(
    key => typeof Object.getOwnPropertyDescriptor(requestProto, key)?.get === 'function',
  );
  if (!getterKey || otherGetterKeys.length > 0) {
    return undefined;
  }

  const matchResult: unknown = Reflect.get(context.req, getterKey);
  return Array.isArray(matchResult) && isMatchedHandlerList(matchResult[0]) ? matchResult[0] : undefined;
}

/**
 * Wraps the route handlers of a match result, so that each records `c.req.routeIndex` when it starts.
 * Inside a route handler the index is correct on every Hono major, but Hono 5 restores it after
 * `next()`, so the Sentry middleware cannot read it there.
 *
 * `compose` reads each handler from the match result when it calls it, so a wrap from inside the
 * Sentry middleware still covers the handlers that run after it.
 */
export function wrapRouteHandlers(handlers: MatchedHandler[]): void {
  const middlewareFlags = getMiddlewareFlags(handlers.map(([[, route]]) => route));
  for (const [i, [pair]] of handlers.entries()) {
    if (!middlewareFlags[i]) {
      pair[0] = recordRouteHandlerIndex(pair[0]);
    }
  }
}

function recordRouteHandlerIndex(handler: HonoRoute['handler']): HonoRoute['handler'] {
  if (Reflect.get(handler, RECORDS_ROUTE_HANDLER_INDEX)) {
    return handler;
  }

  return new Proxy(handler, {
    apply(target, thisArg, args: [Context, ...unknown[]]) {
      const [context] = args;
      addNonEnumerableProperty(context, ROUTE_HANDLER_INDEX, context.req.routeIndex);
      return Reflect.apply(target, thisArg, args);
    },
    get(target, prop, receiver) {
      if (prop === RECORDS_ROUTE_HANDLER_INDEX) {
        return true;
      }
      if (prop === '__sentry_original__') {
        return handler;
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

export function getRecordedRouteHandlerIndex(context: Context): number | undefined {
  const index: unknown = Reflect.get(context, ROUTE_HANDLER_INDEX);
  return typeof index === 'number' ? index : undefined;
}
