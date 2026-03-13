import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
  isWrapped,
} from '@opentelemetry/instrumentation';
import { captureException, SDK_VERSION, startSpan, withIsolationScope } from '@sentry/core';
import { getBullMQProcessSpanOptions } from './helpers';
import type { ProcessorDecoratorTarget } from './types';

const supportedVersions = ['>=10.0.0'];
const COMPONENT = '@nestjs/bullmq';

/**
 * Custom instrumentation for nestjs bullmq module.
 *
 * This hooks into the `@Processor` class decorator, which is applied on queue processor classes.
 * It wraps the `process` method on the decorated class to fork the isolation scope for each job
 * invocation, create a span, and capture errors.
 */
export class SentryNestBullMQInstrumentation extends InstrumentationBase {
  public constructor(config: InstrumentationConfig = {}) {
    super('sentry-nestjs-bullmq', SDK_VERSION, config);
  }

  /**
   * Initializes the instrumentation by defining the modules to be patched.
   */
  public init(): InstrumentationNodeModuleDefinition {
    const moduleDef = new InstrumentationNodeModuleDefinition(COMPONENT, supportedVersions);

    moduleDef.files.push(this._getProcessorFileInstrumentation(supportedVersions));
    return moduleDef;
  }

  /**
   * Wraps the @Processor decorator.
   */
  private _getProcessorFileInstrumentation(versions: string[]): InstrumentationNodeModuleFile {
    return new InstrumentationNodeModuleFile(
      '@nestjs/bullmq/dist/decorators/processor.decorator.js',
      versions,
      (moduleExports: { Processor: ProcessorDecoratorTarget }) => {
        if (isWrapped(moduleExports.Processor)) {
          this._unwrap(moduleExports, 'Processor');
        }
        this._wrap(moduleExports, 'Processor', this._createWrapProcessor());
        return moduleExports;
      },
      (moduleExports: { Processor: ProcessorDecoratorTarget }) => {
        this._unwrap(moduleExports, 'Processor');
      },
    );
  }

  /**
   * Creates a wrapper function for the @Processor class decorator.
   */
  private _createWrapProcessor() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return function wrapProcessor(original: any) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return function wrappedProcessor(...decoratorArgs: any[]) {
        // Extract queue name from decorator args
        // @Processor('queueName') or @Processor({ name: 'queueName' })
        const queueName =
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          typeof decoratorArgs[0] === 'string' ? decoratorArgs[0] : decoratorArgs[0]?.name || 'unknown';

        // Get the original class decorator
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const classDecorator = original(...decoratorArgs);

        // Return a new class decorator that wraps the process method
        return function (target: ProcessorDecoratorTarget) {
          const originalProcess = target.prototype.process;

          if (
            originalProcess &&
            typeof originalProcess === 'function' &&
            !target.__SENTRY_INTERNAL__ &&
            !originalProcess.__SENTRY_INSTRUMENTED__
          ) {
            target.prototype.process = new Proxy(originalProcess, {
              apply: (originalProcessFn, thisArg, args) => {
                return withIsolationScope(() => {
                  return startSpan(getBullMQProcessSpanOptions(queueName), async () => {
                    try {
                      return await originalProcessFn.apply(thisArg, args);
                    } catch (error) {
                      captureException(error, {
                        mechanism: {
                          handled: false,
                          type: 'auto.queue.nestjs.bullmq',
                        },
                      });
                      throw error;
                    }
                  });
                });
              },
            });

            target.prototype.process.__SENTRY_INSTRUMENTED__ = true;
          }

          // Apply the original class decorator
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return
          return classDecorator(target);
        };
      };
    };
  }
}
