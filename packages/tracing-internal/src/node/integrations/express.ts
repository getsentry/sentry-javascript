/* eslint-disable max-lines */
import type { Transaction } from '@sentry/core';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import { startInactiveSpan, withActiveSpan } from '@sentry/core';
import { SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, spanToJSON } from '@sentry/core';
import type { Integration, PolymorphicRequest } from '@sentry/types';
import {
  GLOBAL_OBJ,
  extractPathForTransaction,
  getNumberOfUrlSegments,
  isRegExp,
  logger,
  stripUrlQueryAndFragment,
} from '@sentry/utils';

import { DEBUG_BUILD } from '../../common/debug-build';

type Method =
  | 'all'
  | 'get'
  | 'post'
  | 'put'
  | 'delete'
  | 'patch'
  | 'options'
  | 'head'
  | 'checkout'
  | 'copy'
  | 'lock'
  | 'merge'
  | 'mkactivity'
  | 'mkcol'
  | 'move'
  | 'm-search'
  | 'notify'
  | 'purge'
  | 'report'
  | 'search'
  | 'subscribe'
  | 'trace'
  | 'unlock'
  | 'unsubscribe'
  | 'use';

type Router = {
  [method in Method]: (...args: any) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

/* Extend the PolymorphicRequest type with a patched parameter to build a reconstructed route */
type PatchedRequest = PolymorphicRequest & { _reconstructedRoute?: string; _hasParameters?: boolean };

/* Types used for patching the express router prototype */
type ExpressRouter = Router & {
  _router?: ExpressRouter;
  stack?: Layer[];
  lazyrouter?: () => void;
  settings?: unknown;
  process_params: (
    layer: Layer,
    called: unknown,
    req: PatchedRequest,
    res: ExpressResponse,
    done: () => void,
  ) => unknown;
};

type Layer = {
  match: (path: string) => boolean;
  handle_request: (req: PatchedRequest, res: ExpressResponse, next: () => void) => void;
  route?: { path: RouteType | RouteType[] };
  path?: string;
  regexp?: RegExp;
  keys?: { name: string | number; offset: number; optional: boolean }[];
};

type RouteType = string | RegExp;

interface ExpressResponse {
  once(name: string, callback: () => void): void;
}

/**
 * Internal helper for `__sentry_transaction`
 * @hidden
 */
interface SentryTracingResponse {
  __sentry_transaction?: Transaction;
}

/**
 * Express integration
 *
 * Provides an request and error handler for Express framework as well as tracing capabilities
 */
export class Express implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'Express';

  /**
   * @inheritDoc
   */
  public name: string;

  /**
   * Express App instance
   */
  private readonly _router?: Router;
  private readonly _methods?: Method[];

  /**
   * @inheritDoc
   */
  public constructor(options: { app?: Router; router?: Router; methods?: Method[] } = {}) {
    this.name = Express.id;
    this._router = options.router || options.app;
    this._methods = (Array.isArray(options.methods) ? options.methods : []).concat('use');
  }

  /**
   * @inheritDoc
   */
  public setupOnce(_: unknown): void {
    if (!this._router) {
      DEBUG_BUILD && logger.error('ExpressIntegration is missing an Express instance');
      return;
    }

    instrumentMiddlewares(this._router, this._methods);
    instrumentRouter(this._router as ExpressRouter);
  }
}

/**
 * Wraps original middleware function in a tracing call, which stores the info about the call as a span,
 * and finishes it once the middleware is done invoking.
 *
 * Express middlewares have 3 various forms, thus we have to take care of all of them:
 * // sync
 * app.use(function (req, res) { ... })
 * // async
 * app.use(function (req, res, next) { ... })
 * // error handler
 * app.use(function (err, req, res, next) { ... })
 *
 * They all internally delegate to the `router[method]` of the given application instance.
 */
// eslint-disable-next-line @typescript-eslint/ban-types, @typescript-eslint/no-explicit-any
function wrap(fn: Function, method: Method): (...args: any[]) => void {
  const arity = fn.length;

  switch (arity) {
    case 2: {
      return function (this: NodeJS.Global, req: unknown, res: ExpressResponse & SentryTracingResponse): void {
        const transaction = res.__sentry_transaction;
        if (transaction) {
          const span = withActiveSpan(transaction, () => {
            return startInactiveSpan({
              name: fn.name,
              op: `middleware.express.${method}`,
              attributes: {
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.middleware.express',
              },
            });
          });
          res.once('finish', () => {
            span.end();
          });
        }
        return fn.call(this, req, res);
      };
    }
    case 3: {
      return function (
        this: NodeJS.Global,
        req: unknown,
        res: ExpressResponse & SentryTracingResponse,
        next: () => void,
      ): void {
        const transaction = res.__sentry_transaction;
        const span = transaction
          ? withActiveSpan(transaction, () => {
              return startInactiveSpan({
                name: fn.name,
                op: `middleware.express.${method}`,
                attributes: {
                  [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.middleware.express',
                },
              });
            })
          : undefined;
        fn.call(this, req, res, function (this: NodeJS.Global, ...args: unknown[]): void {
          span?.end();
          next.call(this, ...args);
        });
      };
    }
    case 4: {
      return function (
        this: NodeJS.Global,
        err: Error,
        req: Request,
        res: Response & SentryTracingResponse,
        next: () => void,
      ): void {
        const transaction = res.__sentry_transaction;
        const span = transaction
          ? withActiveSpan(transaction, () => {
              return startInactiveSpan({
                name: fn.name,
                op: `middleware.express.${method}`,
                attributes: {
                  [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.middleware.express',
                },
              });
            })
          : undefined;
        fn.call(this, err, req, res, function (this: NodeJS.Global, ...args: unknown[]): void {
          span?.end();
          next.call(this, ...args);
        });
      };
    }
    default: {
      throw new Error(`Express middleware takes 2-4 arguments. Got: ${arity}`);
    }
  }
}

/**
 * Takes all the function arguments passed to the original `app` or `router` method, eg. `app.use` or `router.use`
 * and wraps every function, as well as array of functions with a call to our `wrap` method.
 * We have to take care of the arrays as well as iterate over all of the arguments,
 * as `app.use` can accept middlewares in few various forms.
 *
 * app.use([<path>], <fn>)
 * app.use([<path>], <fn>, ...<fn>)
 * app.use([<path>], ...<fn>[])
 */
function wrapMiddlewareArgs(args: unknown[], method: Method): unknown[] {
  return args.map((arg: unknown) => {
    if (typeof arg === 'function') {
      return wrap(arg, method);
    }

    if (Array.isArray(arg)) {
      return arg.map((a: unknown) => {
        if (typeof a === 'function') {
          return wrap(a, method);
        }
        return a;
      });
    }

    return arg;
  });
}

/**
 * Patches original router to utilize our tracing functionality
 */
function patchMiddleware(router: Router, method: Method): Router {
  const originalCallback = router[method];

  router[method] = function (...args: unknown[]): void {
    return originalCallback.call(this, ...wrapMiddlewareArgs(args, method));
  };

  return router;
}

/**
 * Patches original router methods
 */
function instrumentMiddlewares(router: Router, methods: Method[] = []): void {
  methods.forEach((method: Method) => patchMiddleware(router, method));
}

/**
 * Patches the prototype of Express.Router to accumulate the resolved route
 * if a layer instance's `match` function was called and it returned a successful match.
 *
 * @see https://github.com/expressjs/express/blob/master/lib/router/index.js
 *
 * @param appOrRouter the router instance which can either be an app (i.e. top-level) or a (nested) router.
 */
function instrumentRouter(appOrRouter: ExpressRouter): void {
  // This is how we can distinguish between app and routers
  const isApp = 'settings' in appOrRouter;

  // In case the app's top-level router hasn't been initialized yet, we have to do it now
  if (isApp && appOrRouter._router === undefined && appOrRouter.lazyrouter) {
    appOrRouter.lazyrouter();
  }

  const router = isApp ? appOrRouter._router : appOrRouter;

  if (!router) {
    /*
    If we end up here, this means likely that this integration is used with Express 3 or Express 5.
    For now, we don't support these versions (3 is very old and 5 is still in beta). To support Express 5,
    we'd need to make more changes to the routing instrumentation because the router is no longer part of
    the Express core package but maintained in its own package. The new router has different function
    signatures and works slightly differently, demanding more changes than just taking the router from
    `app.router` instead of `app._router`.
    @see https://github.com/pillarjs/router

    TODO: Proper Express 5 support
    */
    DEBUG_BUILD && logger.debug('Cannot instrument router for URL Parameterization (did not find a valid router).');
    DEBUG_BUILD && logger.debug('Routing instrumentation is currently only supported in Express 4.');
    return;
  }

  const routerProto = Object.getPrototypeOf(router) as ExpressRouter;

  const originalProcessParams = routerProto.process_params;
  routerProto.process_params = function process_params(
    layer: Layer,
    called: unknown,
    req: PatchedRequest,
    res: ExpressResponse & SentryTracingResponse,
    done: () => unknown,
  ) {
    // Base case: We're in the first part of the URL (thus we start with the root '/')
    if (!req._reconstructedRoute) {
      req._reconstructedRoute = '';
    }

    // If the layer's partial route has params, is a regex or an array, the route is stored in layer.route.
    const { layerRoutePath, isRegex, isArray, numExtraSegments }: LayerRoutePathInfo = getLayerRoutePathInfo(layer);

    if (layerRoutePath || isRegex || isArray) {
      req._hasParameters = true;
    }

    // Otherwise, the hardcoded path (i.e. a partial route without params) is stored in layer.path
    let partialRoute;

    if (layerRoutePath) {
      partialRoute = layerRoutePath;
    } else {
      /**
       * prevent duplicate segment in _reconstructedRoute param if router match multiple routes before final path
       * example:
       * original url: /api/v1/1234
       * prevent: /api/api/v1/:userId
       * router structure
       * /api -> middleware
       * /api/v1 -> middleware
       * /1234 -> endpoint with param :userId
       * final _reconstructedRoute is /api/v1/:userId
       */
      partialRoute = preventDuplicateSegments(req.originalUrl, req._reconstructedRoute, layer.path) || '';
    }

    // Normalize the partial route so that it doesn't contain leading or trailing slashes
    // and exclude empty or '*' wildcard routes.
    // The exclusion of '*' routes is our best effort to not "pollute" the transaction name
    // with interim handlers (e.g. ones that check authentication or do other middleware stuff).
    // We want to end up with the parameterized URL of the incoming request without any extraneous path segments.
    const finalPartialRoute = partialRoute
      .split('/')
      .filter(segment => segment.length > 0 && (isRegex || isArray || !segment.includes('*')))
      .join('/');

    // If we found a valid partial URL, we append it to the reconstructed route
    if (finalPartialRoute && finalPartialRoute.length > 0) {
      // If the partial route is from a regex route, we append a '/' to close the regex
      req._reconstructedRoute += `/${finalPartialRoute}${isRegex ? '/' : ''}`;
    }

    // Now we check if we are in the "last" part of the route. We determine this by comparing the
    // number of URL segments from the original URL to that of our reconstructed parameterized URL.
    // If we've reached our final destination, we update the transaction name.
    const urlLength = getNumberOfUrlSegments(stripUrlQueryAndFragment(req.originalUrl || '')) + numExtraSegments;
    const routeLength = getNumberOfUrlSegments(req._reconstructedRoute);

    if (urlLength === routeLength) {
      if (!req._hasParameters) {
        if (req._reconstructedRoute !== req.originalUrl) {
          req._reconstructedRoute = req.originalUrl ? stripUrlQueryAndFragment(req.originalUrl) : req.originalUrl;
        }
      }

      const transaction = res.__sentry_transaction;
      const attributes = (transaction && spanToJSON(transaction).data) || {};
      if (transaction && attributes[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE] === 'url') {
        // If the request URL is '/' or empty, the reconstructed route will be empty.
        // Therefore, we fall back to setting the final route to '/' in this case.
        const finalRoute = req._reconstructedRoute || '/';

        const [name, source] = extractPathForTransaction(req, { path: true, method: true, customRoute: finalRoute });
        transaction.updateName(name);
        transaction.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, source);
      }
    }

    return originalProcessParams.call(this, layer, called, req, res, done);
  };
}

type LayerRoutePathInfo = {
  layerRoutePath?: string;
  isRegex: boolean;
  isArray: boolean;
  numExtraSegments: number;
};

/**
 * Recreate layer.route.path from layer.regexp and layer.keys.
 * Works until express.js used package path-to-regexp@0.1.7
 * or until layer.keys contain offset attribute
 *
 * @param layer the layer to extract the stringified route from
 *
 * @returns string in layer.route.path structure 'router/:pathParam' or undefined
 */
export const extractOriginalRoute = (
  path?: Layer['path'],
  regexp?: Layer['regexp'],
  keys?: Layer['keys'],
): string | undefined => {
  if (!path || !regexp || !keys || Object.keys(keys).length === 0 || !keys[0]?.offset) {
    return undefined;
  }

  const orderedKeys = keys.sort((a, b) => a.offset - b.offset);

  // add d flag for getting indices from regexp result
  // eslint-disable-next-line @sentry-internal/sdk/no-regexp-constructor -- regexp comes from express.js
  const pathRegex = new RegExp(regexp, `${regexp.flags}d`);
  /**
   * use custom type cause of TS error with missing indices in RegExpExecArray
   */
  const execResult = pathRegex.exec(path) as (RegExpExecArray & { indices: [number, number][] }) | null;

  if (!execResult || !execResult.indices) {
    return undefined;
  }
  /**
   * remove first match from regex cause contain whole layer.path
   */
  const [, ...paramIndices] = execResult.indices;

  if (paramIndices.length !== orderedKeys.length) {
    return undefined;
  }
  let resultPath = path;
  let indexShift = 0;

  /**
   * iterate param matches from regexp.exec
   */
  paramIndices.forEach((item: [number, number] | undefined, index: number) => {
    /** check if offsets is define because in some cases regex d flag returns undefined */
    if (item) {
      const [startOffset, endOffset] = item;
      /**
       * isolate part before param
       */
      const substr1 = resultPath.substring(0, startOffset - indexShift);
      /**
       * define paramName as replacement in format :pathParam
       */
      const replacement = `:${orderedKeys[index].name}`;

      /**
       * isolate part after param
       */
      const substr2 = resultPath.substring(endOffset - indexShift);

      /**
       * recreate original path but with param replacement
       */
      resultPath = substr1 + replacement + substr2;

      /**
       * calculate new index shift after resultPath was modified
       */
      indexShift = indexShift + (endOffset - startOffset - replacement.length);
    }
  });

  return resultPath;
};

/**
 * Extracts and stringifies the layer's route which can either be a string with parameters (`users/:id`),
 * a RegEx (`/test/`) or an array of strings and regexes (`['/path1', /\/path[2-5]/, /path/:id]`). Additionally
 * returns extra information about the route, such as if the route is defined as regex or as an array.
 *
 * @param layer the layer to extract the stringified route from
 *
 * @returns an object containing the stringified route, a flag determining if the route was a regex
 *          and the number of extra segments to the matched path that are additionally in the route,
 *          if the route was an array (defaults to 0).
 */
function getLayerRoutePathInfo(layer: Layer): LayerRoutePathInfo {
  let lrp = layer.route?.path;

  const isRegex = isRegExp(lrp);
  const isArray = Array.isArray(lrp);

  if (!lrp) {
    // parse node.js major version
    // Next.js will complain if we directly use `proces.versions` here because of edge runtime.
    const [major] = (GLOBAL_OBJ as unknown as NodeJS.Global).process.versions.node.split('.').map(Number);

    // allow call extractOriginalRoute only if node version support Regex d flag, node 16+
    if (major >= 16) {
      /**
       * If lrp does not exist try to recreate original layer path from route regexp
       */
      lrp = extractOriginalRoute(layer.path, layer.regexp, layer.keys);
    }
  }

  if (!lrp) {
    return { isRegex, isArray, numExtraSegments: 0 };
  }

  const numExtraSegments = isArray
    ? Math.max(getNumberOfArrayUrlSegments(lrp as RouteType[]) - getNumberOfUrlSegments(layer.path || ''), 0)
    : 0;

  const layerRoutePath = getLayerRoutePathString(isArray, lrp);

  return { layerRoutePath, isRegex, isArray, numExtraSegments };
}

/**
 * Returns the number of URL segments in an array of routes
 *
 * Example: ['/api/test', /\/api\/post[0-9]/, '/users/:id/details`] -> 7
 */
function getNumberOfArrayUrlSegments(routesArray: RouteType[]): number {
  return routesArray.reduce((accNumSegments: number, currentRoute: RouteType) => {
    // array members can be a RegEx -> convert them toString
    return accNumSegments + getNumberOfUrlSegments(currentRoute.toString());
  }, 0);
}

/**
 * Extracts and returns the stringified version of the layers route path
 * Handles route arrays (by joining the paths together) as well as RegExp and normal
 * string values (in the latter case the toString conversion is technically unnecessary but
 * it doesn't hurt us either).
 */
function getLayerRoutePathString(isArray: boolean, lrp?: RouteType | RouteType[]): string | undefined {
  if (isArray) {
    return (lrp as RouteType[]).map(r => r.toString()).join(',');
  }
  return lrp && lrp.toString();
}

/**
 * remove duplicate segment contain in layerPath against reconstructedRoute,
 * and return only unique segment that can be added into reconstructedRoute
 */
export function preventDuplicateSegments(
  originalUrl?: string,
  reconstructedRoute?: string,
  layerPath?: string,
): string | undefined {
  // filter query params
  const normalizeURL = stripUrlQueryAndFragment(originalUrl || '');
  const originalUrlSplit = normalizeURL?.split('/').filter(v => !!v);
  let tempCounter = 0;
  const currentOffset = reconstructedRoute?.split('/').filter(v => !!v).length || 0;
  const result = layerPath
    ?.split('/')
    .filter(segment => {
      if (originalUrlSplit?.[currentOffset + tempCounter] === segment) {
        tempCounter += 1;
        return true;
      }
      return false;
    })
    .join('/');
  return result;
}
