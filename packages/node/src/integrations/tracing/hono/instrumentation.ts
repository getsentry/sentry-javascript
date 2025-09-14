import type { Span } from '@opentelemetry/api';
import { context, SpanStatusCode, trace } from '@opentelemetry/api';
import { InstrumentationBase, InstrumentationNodeModuleDefinition } from '@opentelemetry/instrumentation';
import { isThenable } from '@sentry/core';
import { AttributeNames, HonoTypes } from './constants';
import type {
  Context,
  Handler,
  HandlerInterface,
  Hono,
  HonoInstance,
  MiddlewareHandler,
  MiddlewareHandlerInterface,
  Next,
  OnHandlerInterface,
} from './types';

const PACKAGE_NAME = '@sentry/instrumentation-hono';
const PACKAGE_VERSION = '0.0.1';

/**
 * Hono instrumentation for OpenTelemetry
 */
export class HonoInstrumentation extends InstrumentationBase {
  public constructor() {
    super(PACKAGE_NAME, PACKAGE_VERSION, {});
  }

  /**
   * Initialize the instrumentation.
   */
  public init(): InstrumentationNodeModuleDefinition[] {
    return [
      new InstrumentationNodeModuleDefinition('hono', ['>=4.0.0 <5'], moduleExports => this._patch(moduleExports)),
    ];
  }

  /**
   * Patches the module exports to instrument Hono.
   */
  private _patch(moduleExports: { Hono: Hono }): { Hono: Hono } {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const instrumentation = this;

    class WrappedHono extends moduleExports.Hono {
      public constructor(...args: unknown[]) {
        super(...args);

        instrumentation._wrap(this, 'get', instrumentation._patchHandler());
        instrumentation._wrap(this, 'post', instrumentation._patchHandler());
        instrumentation._wrap(this, 'put', instrumentation._patchHandler());
        instrumentation._wrap(this, 'delete', instrumentation._patchHandler());
        instrumentation._wrap(this, 'options', instrumentation._patchHandler());
        instrumentation._wrap(this, 'patch', instrumentation._patchHandler());
        instrumentation._wrap(this, 'all', instrumentation._patchHandler());
        instrumentation._wrap(this, 'on', instrumentation._patchOnHandler());
        instrumentation._wrap(this, 'use', instrumentation._patchMiddlewareHandler());
      }
    }

    try {
      moduleExports.Hono = WrappedHono;
    } catch {
      // This is a workaround for environments where direct assignment is not allowed.
      return { ...moduleExports, Hono: WrappedHono };
    }

    return moduleExports;
  }

  /**
   * Patches the route handler to instrument it.
   */
  private _patchHandler(): (original: HandlerInterface) => HandlerInterface {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const instrumentation = this;

    return function (original: HandlerInterface) {
      return function wrappedHandler(this: HonoInstance, ...args: unknown[]) {
        if (typeof args[0] === 'string') {
          const path = args[0];
          if (args.length === 1) {
            return original.apply(this, [path]);
          }

          const handlers = args.slice(1);
          return original.apply(this, [
            path,
            ...handlers.map((handler, index) =>
              instrumentation._wrapHandler(
                index + 1 === handlers.length ? HonoTypes.REQUEST_HANDLER : HonoTypes.MIDDLEWARE,
                handler as Handler | MiddlewareHandler,
              ),
            ),
          ]);
        }

        return original.apply(
          this,
          args.map((handler, index) =>
            instrumentation._wrapHandler(
              index + 1 === args.length ? HonoTypes.REQUEST_HANDLER : HonoTypes.MIDDLEWARE,
              handler as Handler | MiddlewareHandler,
            ),
          ),
        );
      };
    };
  }

  /**
   * Patches the 'on' handler to instrument it.
   */
  private _patchOnHandler(): (original: OnHandlerInterface) => OnHandlerInterface {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const instrumentation = this;

    return function (original: OnHandlerInterface) {
      return function wrappedHandler(this: HonoInstance, ...args: unknown[]) {
        const handlers = args.slice(2);
        return original.apply(this, [
          ...args.slice(0, 2),
          ...handlers.map((handler, index) =>
            instrumentation._wrapHandler(
              index + 1 === handlers.length ? HonoTypes.REQUEST_HANDLER : HonoTypes.MIDDLEWARE,
              handler as Handler | MiddlewareHandler,
            ),
          ),
        ]);
      };
    };
  }

  /**
   * Patches the middleware handler to instrument it.
   */
  private _patchMiddlewareHandler(): (original: MiddlewareHandlerInterface) => MiddlewareHandlerInterface {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const instrumentation = this;

    return function (original: MiddlewareHandlerInterface) {
      return function wrappedHandler(this: HonoInstance, ...args: unknown[]) {
        if (typeof args[0] === 'string') {
          const path = args[0];
          if (args.length === 1) {
            return original.apply(this, [path]);
          }

          const handlers = args.slice(1);
          return original.apply(this, [
            path,
            ...handlers.map(handler =>
              instrumentation._wrapHandler(HonoTypes.MIDDLEWARE, handler as MiddlewareHandler),
            ),
          ]);
        }

        return original.apply(
          this,
          args.map(handler => instrumentation._wrapHandler(HonoTypes.MIDDLEWARE, handler as MiddlewareHandler)),
        );
      };
    };
  }

  /**
   * Wraps a handler or middleware handler to apply instrumentation.
   */
  private _wrapHandler(type: HonoTypes, handler: Handler | MiddlewareHandler): Handler | MiddlewareHandler {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const instrumentation = this;

    return function (this: unknown, c: Context, next: Next) {
      if (!instrumentation.isEnabled()) {
        return handler.apply(this, [c, next]);
      }

      const path = c.req.path;
      const spanName = `${type.replace('_', ' ')} - ${path}`;
      const span = instrumentation.tracer.startSpan(spanName, {
        attributes: {
          [AttributeNames.HONO_TYPE]: type,
          [AttributeNames.HONO_NAME]: type === 'request_handler' ? path : handler.name || 'anonymous',
        },
      });

      return context.with(trace.setSpan(context.active(), span), () => {
        return instrumentation._safeExecute(
          () => handler.apply(this, [c, next]),
          () => span.end(),
          error => {
            instrumentation._handleError(span, error);
            span.end();
          },
        );
      });
    };
  }

  /**
   * Safely executes a function and handles errors.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _safeExecute(execute: () => any, onSuccess: () => void, onFailure: (error: unknown) => void): () => any {
    try {
      const result = execute();

      if (isThenable(result)) {
        result.then(
          () => onSuccess(),
          (error: unknown) => onFailure(error),
        );
      } else {
        onSuccess();
      }

      return result;
    } catch (error: unknown) {
      onFailure(error);
      throw error;
    }
  }

  /**
   * Handles errors by setting the span status and recording the exception.
   */
  private _handleError(span: Span, error: unknown): void {
    if (error instanceof Error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });
      span.recordException(error);
    }
  }
}
