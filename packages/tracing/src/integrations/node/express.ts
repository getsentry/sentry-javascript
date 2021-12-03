import { Integration, Transaction } from '@sentry/types';
import { logger } from '@sentry/utils';

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
      logger.error('ExpressIntegration is missing an Express instance');
      return;
    }
    instrumentMiddlewares(this._router, this._methods);
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
      return function(this: NodeJS.Global, req: unknown, res: ExpressResponse & SentryTracingResponse): void {
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
      return function(
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
        fn.call(this, req, res, function(this: NodeJS.Global, ...args: unknown[]): void {
          span?.finish();
          next.call(this, ...args);
        });
      };
    }
    case 4: {
      return function(
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
        fn.call(this, err, req, res, function(this: NodeJS.Global, ...args: unknown[]): void {
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

  router[method] = function(...args: unknown[]): void {
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
