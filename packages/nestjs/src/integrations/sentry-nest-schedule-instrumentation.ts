import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
  isWrapped,
} from '@opentelemetry/instrumentation';
import { SDK_VERSION } from '@sentry/core';
import type { AnyFn } from './helpers';
import type { ScheduleDecoratorTarget } from './types';
import {
  MECHANISM_CRON,
  MECHANISM_INTERVAL,
  MECHANISM_TIMEOUT,
  patchMethodDescriptor,
  wrapScheduleHandler,
} from './wrap-handlers';

const supportedVersions = ['>=2.0.0'];
const COMPONENT = '@nestjs/schedule';

/**
 * Custom instrumentation for nestjs schedule module.
 *
 * This hooks into the `@Cron`, `@Interval`, and `@Timeout` decorators, which are applied on scheduled task handlers.
 * It forks the isolation scope for each handler invocation, preventing data leakage to subsequent HTTP requests.
 *
 * The handler-wrapping logic lives in `./wrappers` and is shared with the orchestrion
 * (diagnostics-channel) path.
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

    moduleDef.files.push(this._getDecoratorFileInstrumentation('Cron', 'cron', MECHANISM_CRON, supportedVersions));
    moduleDef.files.push(
      this._getDecoratorFileInstrumentation('Interval', 'interval', MECHANISM_INTERVAL, supportedVersions),
    );
    moduleDef.files.push(
      this._getDecoratorFileInstrumentation('Timeout', 'timeout', MECHANISM_TIMEOUT, supportedVersions),
    );
    return moduleDef;
  }

  /**
   * Wraps a schedule decorator (`@Cron`/`@Interval`/`@Timeout`).
   */
  private _getDecoratorFileInstrumentation(
    exportName: 'Cron' | 'Interval' | 'Timeout',
    fileName: string,
    mechanismType: string,
    versions: string[],
  ): InstrumentationNodeModuleFile {
    return new InstrumentationNodeModuleFile(
      `@nestjs/schedule/dist/decorators/${fileName}.decorator.js`,
      versions,
      (moduleExports: Record<string, ScheduleDecoratorTarget>) => {
        if (isWrapped(moduleExports[exportName])) {
          this._unwrap(moduleExports, exportName);
        }
        this._wrap(moduleExports, exportName, this._createWrapDecorator(mechanismType));
        return moduleExports;
      },
      (moduleExports: Record<string, ScheduleDecoratorTarget>) => {
        this._unwrap(moduleExports, exportName);
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
        const decoratorResult = original(...decoratorArgs);

        return (target: ScheduleDecoratorTarget, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
          patchMethodDescriptor(target, propertyKey, descriptor, (handler: AnyFn) =>
            wrapScheduleHandler(handler, mechanismType),
          );
          return decoratorResult(target, propertyKey, descriptor);
        };
      };
    };
  }
}
