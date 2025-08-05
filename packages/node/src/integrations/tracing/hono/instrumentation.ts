import { InstrumentationBase,InstrumentationNodeModuleDefinition  } from '@opentelemetry/instrumentation';
import type { HandlerInterface, Hono, HonoInstance, MiddlewareHandlerInterface, OnHandlerInterface } from './types';

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
      new InstrumentationNodeModuleDefinition(
        'hono',
        ['>=4.0.0 <5'],
        moduleExports => this._patch(moduleExports),
      ),
    ];
  }

  /**
   * Patches the module exports to instrument Hono.
   */
  private _patch(moduleExports: { Hono: Hono }): { Hono: Hono } {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const instrumentation = this;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function Hono(this: HonoInstance, ...args: any): HonoInstance {
      const app: HonoInstance = moduleExports.Hono.apply(this, args);

      instrumentation._wrap(app, 'get', instrumentation._patchHandler());
      instrumentation._wrap(app, 'post', instrumentation._patchHandler());
      instrumentation._wrap(app, 'put', instrumentation._patchHandler());
      instrumentation._wrap(app, 'delete', instrumentation._patchHandler());
      instrumentation._wrap(app, 'options', instrumentation._patchHandler());
      instrumentation._wrap(app, 'patch', instrumentation._patchHandler());
      instrumentation._wrap(app, 'all', instrumentation._patchHandler());
      instrumentation._wrap(app, 'on', instrumentation._patchOnHandler());
      instrumentation._wrap(app, 'use', instrumentation._patchMiddlewareHandler());

      return app;
    }

    moduleExports.Hono = Hono;
    return moduleExports;
  }

  /**
   * Patches the route handler to instrument it.
   */
  private _patchHandler(): (original: HandlerInterface) => HandlerInterface {
    return function(original: HandlerInterface) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return function wrappedHandler(this: HonoInstance, ...args: any) {
        // TODO: Add OpenTelemetry tracing logic here
        return original.apply(this, args);
      };
    };
  }

  /**
   * Patches the 'on' handler to instrument it.
   */
  private _patchOnHandler(): (original: OnHandlerInterface) => OnHandlerInterface {
    return function(original: OnHandlerInterface) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return function wrappedHandler(this: HonoInstance, ...args: any) {
        // TODO: Add OpenTelemetry tracing logic here
        return original.apply(this, args);
      };
    };
  }

  /**
   * Patches the middleware handler to instrument it.
   */
  private _patchMiddlewareHandler(): (original: MiddlewareHandlerInterface) => MiddlewareHandlerInterface {
    return function(original: MiddlewareHandlerInterface) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return function wrappedHandler(this: HonoInstance, ...args: any) {
        // TODO: Add OpenTelemetry tracing logic here
        return original.apply(this, args);
      };
    };
  }
}
