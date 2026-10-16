import { addNonEnumerableProperty, isPlainObject } from '@sentry/core';
import type { Context, HonoRoute, MatchedHandler } from './honoTypes';
import { getMiddlewareFlags } from './isMiddleware';

// The `Context` key for the `routeIndex` of the last route handler that started. `Symbol.for`, so that
// other copies of `@sentry/server-utils` can read it.
const ROUTE_HANDLER_INDEX = Symbol.for('sentry.hono.routeHandlerIndex');

// Marks the index wrapper, so that a handler gets it only once. The router reuses the same match result
// for each request to a route. Span wrappers do not count, because a route handler from `app.use()`
// has a span wrapper and still needs the index wrapper.
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
 * Reads the match result through the getter that `hono/route` uses (Hono 4.8 and later). `hono` does
 * not export the getter's symbol, so this finds it as the only symbol-keyed getter on the prototype.
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
 * Wraps each route handler, so that it stores `c.req.routeIndex` when it starts. Hono 5 resets the
 * index after `next()`, so the Sentry middleware cannot read it there.
 *
 * Calling this from the Sentry middleware itself works, because `compose` reads each handler from the
 * match result only when it calls it.
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
