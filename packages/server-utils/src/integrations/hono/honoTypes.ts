/**
 * Vendored subset of `hono`'s public types used by the Sentry Hono instrumentation.
 *
 * The instrumentation lives in `@sentry/server-utils`, a dependency of every server SDK — including
 * apps that do not use Hono. We therefore declare no dependency on `hono` at all: not at runtime
 * (the instrumentation never statically imports it; the `Hono` prototype is derived from a live app
 * instance and matched routes are read from the request's own getters), and not at build/type time
 * (these minimal structural types stand in for `hono`'s).
 *
 * ATTENTION: keep these permissive. Values cross the boundary to the `@sentry/hono` SDK, which uses
 * the real `hono` types, so these must stay assignable from them at those call sites.
 */

/* oxlint-disable typescript/no-explicit-any -- vendored, deliberately permissive types */

export interface Env {
  Bindings?: any;
  Variables?: any;
}

export type Next = () => Promise<void>;

export interface HonoRoute {
  method: string;
  path: string;
  // Loose on purpose: Hono's own route handler union (`Handler | MiddlewareHandler`) is wider than a
  // middleware handler, and this must stay assignable from it so the real `Context` flows into the
  // vendored one at the `@sentry/hono` boundary.
  handler: (...args: any[]) => any;
}

export interface HonoRequest {
  raw: Request;
  method: string;
  path: string;
  routeIndex: number;
  // These are public (though deprecated) getters on Hono's request. Reading them avoids a runtime
  // import of the `hono/route` helpers, which are their non-deprecated replacements.
  matchedRoutes: HonoRoute[];
  routePath: string;
  [key: string]: any;
}

export interface Context {
  req: HonoRequest;
  env: unknown;
  error?: Error;
  event: { request: Request };
  [key: string]: any;
}

// Return type is `Promise<Response | void>` (not the wider sync union) to stay assignable to the real
// `hono` `MiddlewareHandler` at the `@sentry/hono` boundary; our handlers are always async.
export type MiddlewareHandler = (context: Context, next: Next) => Promise<Response | void>;

export interface Hono<E extends Env = Env> {
  // `use` is chainable (returns the app), which is also where the `E` type parameter is threaded.
  use: (...args: any[]) => Hono<E>;
  request: (...args: any[]) => Response | Promise<Response>;
  routes: HonoRoute[];
  [key: string]: any;
}

export interface ConnInfoRemote {
  address?: string;
  port?: number;
  transport?: string;
  addressType?: string;
}

export type GetConnInfo = (context: any) => { remote?: ConnInfoRemote };
