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

    moduleExports.Hono = class HonoWrapper extends moduleExports.Hono {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      public constructor(...args: any[]) {
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
    };
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
