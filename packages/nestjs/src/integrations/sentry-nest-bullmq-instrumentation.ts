import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
  isWrapped,
} from '@opentelemetry/instrumentation';
import { SDK_VERSION } from '@sentry/core';
import type { ProcessorDecoratorTarget } from './types';
import { extractQueueName, patchProcessorTarget } from './wrap-handlers';

const supportedVersions = ['>=10.0.0'];
const COMPONENT = '@nestjs/bullmq';

/**
 * Custom instrumentation for nestjs bullmq module.
 *
 * This hooks into the `@Processor` class decorator, which is applied on queue
 * processor classes.
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
        const queueName = extractQueueName(decoratorArgs[0]);

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const classDecorator = original(...decoratorArgs);

        return function (target: ProcessorDecoratorTarget) {
          patchProcessorTarget(target, queueName);
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return
          return classDecorator(target);
        };
      };
    };
  }
}
