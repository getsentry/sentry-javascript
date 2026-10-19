import { addNonEnumerableProperty, isPlainObject } from '@sentry/core';
import type { Context, HonoRoute, MatchedHandler } from './honoTypes';
import { isMiddleware } from './isMiddleware';

// The `Context` key for the `routeIndex` of the last route handler that started. `Symbol.for`, so that
// other copies of `@sentry/server-utils` can read it.
const ROUTE_HANDLER_INDEX = Symbol.for('sentry.hono.routeHandlerIndex');

// Marks the index wrapper, so that a handler gets it only once. The router reuses the same match result
// for each request to a route. Span wrappers do not count, because a route handler from `app.use()`
// has a span wrapper and still needs the index wrapper.
const RECORDS_ROUTE_HANDLER_INDEX = Symbol.for('sentry.hono.recordsRouteHandlerIndex');

// The `Context` key for the callback that runs when a route handler starts.
const ON_ROUTE_HANDLER_START = Symbol.for('sentry.hono.onRouteHandlerStart');

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
 * not export the getter's symbol, so this finds it as the symbol-keyed getter that returns a match
 * result.
 */
export function getMatchedHandlers(context: Context): MatchedHandler[] | undefined {
  const requestProto: object | null = Object.getPrototypeOf(context.req);
  if (!requestProto) {
    return undefined;
  }

  for (const key of Object.getOwnPropertySymbols(requestProto)) {
    if (typeof Object.getOwnPropertyDescriptor(requestProto, key)?.get !== 'function') {
      continue;
    }
    const matchResult: unknown = Reflect.get(context.req, key);
    if (Array.isArray(matchResult) && isMatchedHandlerList(matchResult[0])) {
      return matchResult[0];
    }
  }
  return undefined;
}

/** Runs `callback` each time a route handler of this request starts. */
export function onRouteHandlerStart(context: Context, callback: () => void): void {
  addNonEnumerableProperty(context, ON_ROUTE_HANDLER_START, callback);
}

/**
 * Wraps each route handler, so that it stores `c.req.routeIndex` when it starts. Hono 5 resets the
 * index after `next()`, so the Sentry middleware cannot read it there.
 *
 * Only a route handler that declares `next` can pass the request on to a later one. If none does, the
 * first route handler that runs also responds, so this wraps nothing and returns `false`.
 *
 * Calling this from the Sentry middleware itself works, because `compose` reads each handler from the
 * match result only when it calls it.
 */
export function wrapRouteHandlers(handlers: MatchedHandler[], middlewareFlags: boolean[]): boolean {
  // `isMiddleware()` checks the arity, so for a route handler it tells if the handler declares `next`.
  const canPassOn = handlers.some(([[handler]], i) => !middlewareFlags[i] && isMiddleware(handler));
  if (!canPassOn) {
    return false;
  }

  for (const [i, [pair]] of handlers.entries()) {
    if (!middlewareFlags[i]) {
      pair[0] = recordRouteHandlerIndex(pair[0]);
    }
  }
  return true;
}

function recordRouteHandlerIndex(handler: HonoRoute['handler']): HonoRoute['handler'] {
  if (Reflect.get(handler, RECORDS_ROUTE_HANDLER_INDEX)) {
    return handler;
  }

  return new Proxy(handler, {
    apply(target, thisArg, args: [Context, ...unknown[]]) {
      const [context] = args;
      addNonEnumerableProperty(context, ROUTE_HANDLER_INDEX, context.req.routeIndex);
      const onStart: unknown = Reflect.get(context, ON_ROUTE_HANDLER_START);
      if (typeof onStart === 'function') {
        onStart();
      }
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
