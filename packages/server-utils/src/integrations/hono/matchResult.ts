import { addNonEnumerableProperty, isPlainObject } from '@sentry/core';
import type { Context, HonoRoute, MatchedHandler } from './honoTypes';
import { isMiddleware } from './isMiddleware';

// `routeIndex` of the route handler that started last. `Symbol.for` shares it between SDK copies.
const ROUTE_HANDLER_INDEX = Symbol.for('sentry.hono.routeHandlerIndex');

// Marks the index wrapper. The router reuses the match result for each request to a route, so without
// it the wrappers pile up. A span wrapper does not count: a route handler from `app.use()` has one and
// still needs this wrapper.
const RECORDS_ROUTE_HANDLER_INDEX = Symbol.for('sentry.hono.recordsRouteHandlerIndex');

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

/** The match result is internal to Hono. The SDK uses it only in the shape that `compose` reads. */
export function isMatchedHandlerList(handlers: unknown): handlers is MatchedHandler[] {
  return Array.isArray(handlers) && handlers.every(isMatchedHandler);
}

/**
 * Reads the match result like `hono/route` does (Hono 4.8+). Hono does not export the getter's symbol,
 * so this looks for a symbol getter that returns a match result.
 * https://github.com/honojs/hono/blob/v5.0.0-rc.1/src/helper/route/index.ts#L32-L34
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
 * Wraps the route handlers so that each stores `c.req.routeIndex` when it starts. Hono 5 resets the
 * index after `next()` (https://github.com/honojs/hono/pull/4424).
 *
 * Wraps only if a route handler declares `next`. Otherwise the first route handler also responds.
 * Returns `true` if it wrapped.
 *
 * Safe to call during the request: `compose` reads each handler only when it calls it.
 */
export function wrapRouteHandlers(handlers: MatchedHandler[], middlewareFlags: boolean[]): boolean {
  // For a route handler, `isMiddleware()` tells if it declares `next`.
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
