import { EventProcessor, Hub, Integration } from '@sentry/types';
import { logger } from '@sentry/utils';
import { Application, ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Express integration
 *
 * Provides an request and error handler for Express framework
 * as well as tracing capabilities
 */
export class Express implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = Express.id;

  /**
   * @inheritDoc
   */
  public static id: string = 'Express';

  /**
   * Express App instance
   */
  private readonly _app?: Application;

  /**
   * @inheritDoc
   */
  public constructor(options: { app?: Application } = {}) {
    this._app = options.app;
  }

  /**
   * @inheritDoc
   */
  public setupOnce(_addGlobalEventProcessor: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    if (!this._app) {
      logger.error('ExpressIntegration is missing an Express instancex');
      return;
    }
    instrumentMiddlewares(this._app, getCurrentHub);
  }
}

/**
 * JSDoc
 */
function wrap(fn: Function, getCurrentHub: () => Hub): RequestHandler | ErrorRequestHandler {
  const arrity = fn.length;

  switch (arrity) {
    case 2: {
      return function(this: NodeJS.Global, _req: Request, res: Response): any {
        const span = getCurrentHub().startSpan({
          description: fn.name,
          op: 'middleware',
        });
        res.once('finish', () => span.finish());
        return fn.apply(this, arguments);
      };
    }
    case 3: {
      return function(this: NodeJS.Global, req: Request, res: Response, next: NextFunction): any {
        const span = getCurrentHub().startSpan({
          description: fn.name,
          op: 'middleware',
        });
        fn.call(this, req, res, function(this: NodeJS.Global): any {
          span.finish();
          return next.apply(this, arguments);
        });
      };
    }
    case 4: {
      return function(this: NodeJS.Global, err: any, req: Request, res: Response, next: NextFunction): any {
        const span = getCurrentHub().startSpan({
          description: fn.name,
          op: 'middleware',
        });
        fn.call(this, err, req, res, function(this: NodeJS.Global): any {
          span.finish();
          return next.apply(this, arguments);
        });
      };
    }
    default: {
      throw new Error(`Express middleware takes 2-4 arguments. Got: ${arrity}`);
    }
  }
}

/**
 * JSDoc
 */
function wrapUseArgs(args: IArguments, getCurrentHub: () => Hub): unknown[] {
  return Array.from(args).map((arg: unknown) => {
    if (typeof arg === 'function') {
      return wrap(arg, getCurrentHub);
    }

    if (Array.isArray(arg)) {
      return arg.map((a: unknown) => {
        if (typeof a === 'function') {
          return wrap(a, getCurrentHub);
        }
        return a;
      });
    }

    return arg;
  });
}

/**
 * JSDoc
 */
function instrumentMiddlewares(app: Application, getCurrentHub: () => Hub): any {
  const originalAppUse = app.use;
  app.use = function(): any {
    return originalAppUse.apply(this, wrapUseArgs(arguments, getCurrentHub));
  };
  return app;
}
