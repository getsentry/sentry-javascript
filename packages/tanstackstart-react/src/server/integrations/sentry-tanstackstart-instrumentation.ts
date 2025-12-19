import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import { InstrumentationBase, InstrumentationNodeModuleDefinition } from '@opentelemetry/instrumentation';
import { SDK_VERSION } from '@sentry/core';

const supportedVersions = ['>=1.0.0'];
const COMPONENT = '@tanstack/react-start';

type StartConfig = {
  requestMiddleware?: unknown[];
};

type CreateStartFn = (configFn: () => StartConfig) => unknown;

/**
 * Custom instrumentation for @tanstack/react-start.
 *
 * This hooks into createStart to instrument global request middleware.
 */
export class SentryTanstackStartInstrumentation extends InstrumentationBase {
  public constructor(config: InstrumentationConfig = {}) {
    console.log('SentryTanstackStartInstrumentation constructor');
    super('sentry-tanstackstart', SDK_VERSION, config);
  }

  /**
   * Initializes the instrumentation by defining the modules to be patched.
   */
  public init(): InstrumentationNodeModuleDefinition {
    console.log('SentryTanstackStartInstrumentation init');
    return new InstrumentationNodeModuleDefinition(
      COMPONENT,
      supportedVersions,
      (moduleExports: { createStart?: CreateStartFn }) => {
        console.log('SentryTanstackStartInstrumentation init moduleExports', moduleExports);
        if (moduleExports.createStart) {
          moduleExports.createStart = this._wrapCreateStart(moduleExports.createStart);
        }
        return moduleExports;
      },
      (moduleExports: { createStart?: CreateStartFn }) => {
        console.log('SentryTanstackStartInstrumentation init unwrap moduleExports', moduleExports);
        return moduleExports;
      },
    );
  }

  /**
   * Wraps the createStart function to intercept middleware registration.
   */
  private _wrapCreateStart(originalCreateStart: CreateStartFn): CreateStartFn {
    console.log('SentryTanstackStartInstrumentation _wrapCreateStart');
    return (configFn: () => StartConfig) => {
      const wrappedConfigFn = (): StartConfig => {
        const config = configFn();
        console.log('SentryTanstackStartInstrumentation _wrapCreateStart config', config);

        if (config.requestMiddleware && Array.isArray(config.requestMiddleware)) {
          // eslint-disable-next-line no-console
          console.log(`[Sentry] ${config.requestMiddleware.length} global middleware(s) registered`);

          // Wrap each middleware with a proxy
          config.requestMiddleware = config.requestMiddleware.map(middleware => {
            return this._wrapMiddleware(middleware);
          });
        }

        return config;
      };

      return originalCreateStart(wrappedConfigFn);
    };
  }

  /**
   * Wraps a middleware with a proxy that adds logging.
   */
  private _wrapMiddleware(middleware: unknown): unknown {
    return new Proxy(middleware as object, {
      apply: (target, thisArg, args) => {
        // eslint-disable-next-line no-console
        console.log('hello from middleware!');
        return Reflect.apply(target as (...args: unknown[]) => unknown, thisArg, args);
      },
    });
  }
}
