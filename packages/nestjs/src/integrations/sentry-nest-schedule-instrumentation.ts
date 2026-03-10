import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
  isWrapped,
} from '@opentelemetry/instrumentation';
import { captureException, isThenable, SDK_VERSION, withIsolationScope } from '@sentry/core';
import type { ScheduleDecoratorTarget } from './types';

const supportedVersions = ['>=4.0.0'];
const COMPONENT = '@nestjs/schedule';

/**
 * Custom instrumentation for nestjs schedule module.
 *
 * This hooks into the `@Cron`, `@Interval`, and `@Timeout` decorators, which are applied on scheduled task handlers.
 * It forks the isolation scope for each handler invocation, preventing data leakage to subsequent HTTP requests.
 */
export class SentryNestScheduleInstrumentation extends InstrumentationBase {
  public constructor(config: InstrumentationConfig = {}) {
    super('sentry-nestjs-schedule', SDK_VERSION, config);
  }

  /**
   * Initializes the instrumentation by defining the modules to be patched.
   */
  public init(): InstrumentationNodeModuleDefinition {
    const moduleDef = new InstrumentationNodeModuleDefinition(COMPONENT, supportedVersions);

    moduleDef.files.push(this._getCronFileInstrumentation(supportedVersions));
    moduleDef.files.push(this._getIntervalFileInstrumentation(supportedVersions));
    moduleDef.files.push(this._getTimeoutFileInstrumentation(supportedVersions));
    return moduleDef;
  }

  /**
   * Wraps the @Cron decorator.
   */
  private _getCronFileInstrumentation(versions: string[]): InstrumentationNodeModuleFile {
    return new InstrumentationNodeModuleFile(
      '@nestjs/schedule/dist/decorators/cron.decorator.js',
      versions,
      (moduleExports: { Cron: ScheduleDecoratorTarget }) => {
        if (isWrapped(moduleExports.Cron)) {
          this._unwrap(moduleExports, 'Cron');
        }
        this._wrap(moduleExports, 'Cron', this._createWrapDecorator('auto.schedule.nestjs.cron'));
        return moduleExports;
      },
      (moduleExports: { Cron: ScheduleDecoratorTarget }) => {
        this._unwrap(moduleExports, 'Cron');
      },
    );
  }

  /**
   * Wraps the @Interval decorator.
   */
  private _getIntervalFileInstrumentation(versions: string[]): InstrumentationNodeModuleFile {
    return new InstrumentationNodeModuleFile(
      '@nestjs/schedule/dist/decorators/interval.decorator.js',
      versions,
      (moduleExports: { Interval: ScheduleDecoratorTarget }) => {
        if (isWrapped(moduleExports.Interval)) {
          this._unwrap(moduleExports, 'Interval');
        }
        this._wrap(moduleExports, 'Interval', this._createWrapDecorator('auto.schedule.nestjs.interval'));
        return moduleExports;
      },
      (moduleExports: { Interval: ScheduleDecoratorTarget }) => {
        this._unwrap(moduleExports, 'Interval');
      },
    );
  }

  /**
   * Wraps the @Timeout decorator.
   */
  private _getTimeoutFileInstrumentation(versions: string[]): InstrumentationNodeModuleFile {
    return new InstrumentationNodeModuleFile(
      '@nestjs/schedule/dist/decorators/timeout.decorator.js',
      versions,
      (moduleExports: { Timeout: ScheduleDecoratorTarget }) => {
        if (isWrapped(moduleExports.Timeout)) {
          this._unwrap(moduleExports, 'Timeout');
        }
        this._wrap(moduleExports, 'Timeout', this._createWrapDecorator('auto.schedule.nestjs.timeout'));
        return moduleExports;
      },
      (moduleExports: { Timeout: ScheduleDecoratorTarget }) => {
        this._unwrap(moduleExports, 'Timeout');
      },
    );
  }

  /**
   * Creates a wrapper function for a schedule decorator (@Cron, @Interval, or @Timeout).
   */
  private _createWrapDecorator(mechanismType: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return function wrapDecorator(original: any) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return function wrappedDecorator(...decoratorArgs: any[]) {
        // Get the original decorator result
        const decoratorResult = original(...decoratorArgs);

        // Return a new decorator function that wraps the handler
        return (target: ScheduleDecoratorTarget, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
          if (
            !descriptor.value ||
            typeof descriptor.value !== 'function' ||
            target.__SENTRY_INTERNAL__ ||
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            descriptor.value.__SENTRY_INSTRUMENTED__
          ) {
            return decoratorResult(target, propertyKey, descriptor);
          }

          const originalHandler = descriptor.value;
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          const handlerName = originalHandler.name || propertyKey;

          // Not using async/await here to avoid changing the return type of sync handlers.
          // This means we need to handle sync and async errors separately.
          descriptor.value = function (...args: unknown[]) {
            return withIsolationScope(() => {
              let result;
              try {
                // Catches errors from sync handlers
                result = originalHandler.apply(this, args);
              } catch (error) {
                captureException(error, {
                  mechanism: {
                    handled: false,
                    type: mechanismType,
                  },
                });
                throw error;
              }

              // Catches errors from async handlers (rejected promises bypass try/catch)
              if (isThenable(result)) {
                return result.then(undefined, (error: unknown) => {
                  captureException(error, {
                    mechanism: {
                      handled: false,
                      type: mechanismType,
                    },
                  });
                  throw error;
                });
              }

              return result;
            });
          };

          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          descriptor.value.__SENTRY_INSTRUMENTED__ = true;

          // Preserve the original function name
          Object.defineProperty(descriptor.value, 'name', {
            value: handlerName,
            configurable: true,
            enumerable: true,
            writable: true,
          });

          // Apply the original decorator
          return decoratorResult(target, propertyKey, descriptor);
        };
      };
    };
  }
}
