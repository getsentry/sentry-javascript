import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import { InstrumentationBase, InstrumentationNodeModuleDefinition } from '@opentelemetry/instrumentation';
import { ATTR_HTTP_REQUEST_METHOD, ATTR_HTTP_ROUTE } from '@opentelemetry/semantic-conventions';
import type { Span } from '@sentry/core';
import {
  debug,
  getDefaultIsolationScope,
  getIsolationScope,
  isThenable,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  spanToJSON,
  startSpan,
} from '@sentry/core';
import { DEBUG_BUILD } from '../../../debug-build';
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
export class HonoInstrumentation extends InstrumentationBase<InstrumentationConfig> {
  public constructor(config: InstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);
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
            ...handlers.map(handler => instrumentation._wrapHandler(handler as Handler | MiddlewareHandler)),
          ]);
        }

        return original.apply(
          this,
          args.map(handler => instrumentation._wrapHandler(handler as Handler | MiddlewareHandler)),
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
          ...handlers.map(handler => instrumentation._wrapHandler(handler as Handler | MiddlewareHandler)),
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
            ...handlers.map(handler => instrumentation._wrapHandler(handler as MiddlewareHandler)),
          ]);
        }

        return original.apply(
          this,
          args.map(handler => instrumentation._wrapHandler(handler as MiddlewareHandler)),
        );
      };
    };
  }

  /**
   * Wraps a handler or middleware handler to apply instrumentation.
   */
  private _wrapHandler(handler: Handler | MiddlewareHandler): Handler | MiddlewareHandler {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const instrumentation = this;

    return function (this: unknown, c: Context, next: Next) {
      if (!instrumentation.isEnabled()) {
        return handler.apply(this, [c, next]);
      }

      const path = c.req.path;

      return startSpan(
        { name: path, attributes: { [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.otel.hono' } },
        span => {
          const result = handler.apply(this, [c, next]);
          if (isThenable(result)) {
            return result.then(resolved => {
              instrumentation._onHandlerComplete(span, resolved, path, handler);
              return resolved;
            });
          }
          instrumentation._onHandlerComplete(span, result, path, handler);
          return result;
        },
      );
    };
  }

  /**
   * Determines the handler type based on the result.
   * @param result
   * @private
   */
  private _determineHandlerType(result: unknown): HonoTypes {
    return result === undefined ? HonoTypes.MIDDLEWARE : HonoTypes.REQUEST_HANDLER;
  }

  /**
   * Sets Sentry span attributes once the handler has resolved.
   */
  private _onHandlerComplete(span: Span, result: unknown, path: string, handler: Handler | MiddlewareHandler): void {
    const type = this._determineHandlerType(result);
    const name = type === HonoTypes.REQUEST_HANDLER ? path : handler.name || 'anonymous';

    span.setAttributes({
      [AttributeNames.HONO_TYPE]: type,
      [AttributeNames.HONO_NAME]: name,
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: `${type}.hono`,
    });
    span.updateName(name);

    if (getIsolationScope() === getDefaultIsolationScope()) {
      DEBUG_BUILD && debug.warn('Isolation scope is default isolation scope - skipping setting transactionName');
      return;
    }

    const spanData = spanToJSON(span).data;
    const route = spanData[ATTR_HTTP_ROUTE];
    const method = spanData[ATTR_HTTP_REQUEST_METHOD];
    if (typeof route === 'string' && typeof method === 'string') {
      getIsolationScope().setTransactionName(`${method} ${route}`);
    }
  }
}
