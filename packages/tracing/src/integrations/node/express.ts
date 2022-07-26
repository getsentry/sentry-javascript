/* eslint-disable max-lines */
import { Integration, Transaction } from '@sentry/types';
import { CrossPlatformRequest, extractPathForTransaction, logger } from '@sentry/utils';

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

/* Extend the CrossPlatformRequest type with a patched parameter to build a reconstructed route */
type PatchedRequest = CrossPlatformRequest & { _reconstructedRoute?: string };

/* Type used for pathing the express router prototype */
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

/* Type used for pathing the express router prototype */
type Layer = {
  match: (path: string) => boolean;
  handle_request: (req: PatchedRequest, res: ExpressResponse, next: () => void) => void;
  route?: { path: string };
  path?: string;
};

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
  public name: string = Express.id;

  /**
   * Express App instance
   */
  private readonly _router?: Router;
  private readonly _methods?: Method[];

  /**
   * @inheritDoc
   */
  public constructor(options: { app?: Router; router?: Router; methods?: Method[] } = {}) {
    this._router = options.router || options.app;
    this._methods = (Array.isArray(options.methods) ? options.methods : []).concat('use');
  }

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    if (!this._router) {
      __DEBUG_BUILD__ && logger.error('ExpressIntegration is missing an Express instance');
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
          const span = transaction.startChild({
            description: fn.name,
            op: `express.middleware.${method}`,
          });
          res.once('finish', () => {
            span.finish();
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
        const span = transaction?.startChild({
          description: fn.name,
          op: `express.middleware.${method}`,
        });
        fn.call(this, req, res, function (this: NodeJS.Global, ...args: unknown[]): void {
          span?.finish();
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
        const span = transaction?.startChild({
          description: fn.name,
          op: `express.middleware.${method}`,
        });
        fn.call(this, err, req, res, function (this: NodeJS.Global, ...args: unknown[]): void {
          span?.finish();
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

    // If the layer's partial route has params, the route is stored in layer.route. Otherwise, the hardcoded path
    // (i.e. a partial route without params) is stored in layer.path
    const partialRoute = layer.route?.path || layer.path || '';

    // Normalize the partial route so that it doesn't contain leading or trailing slashes
    // and exclude empty or '*' wildcard routes.
    // The exclusion of '*' routes is our best effort to not "pollute" the transaction name
    // with interim handlers (e.g. ones that check authentication or do other middleware stuff).
    // We want to end up with the parameterized URL of the incoming request without any extraneous path segments.
    const finalPartialRoute = partialRoute
      .split('/')
      .filter(segment => segment.length > 0 && !segment.includes('*'))
      .join('/');

    // If we found a valid partial URL, we append it to the reconstructed route
    if (finalPartialRoute.length > 0) {
      req._reconstructedRoute += `/${finalPartialRoute}`;
    }

    // Now we check if we are in the "last" part of the route. We determine this by comparing the
    // number of URL segments from the original URL to that of our reconstructed parameterized URL.
    // If we've reached our final destination, we update the transaction name.
    const urlLength = req.originalUrl?.split('/').filter(s => s.length > 0).length;
    const routeLength = req._reconstructedRoute.split('/').filter(s => s.length > 0).length;
    if (urlLength === routeLength) {
      const transaction = res.__sentry_transaction;
      if (transaction && transaction.metadata.source !== 'custom') {
        // If the request URL is '/' or empty, the reconstructed route will be empty.
        // Therefore, we fall back to setting the final route to '/' in this case.
        const finalRoute = req._reconstructedRoute || '/';

        transaction.setName(...extractPathForTransaction(req, { path: true, method: true }, finalRoute));
      }
    }

    return originalProcessParams.call(this, layer, called, req, res, done);
  };
}
