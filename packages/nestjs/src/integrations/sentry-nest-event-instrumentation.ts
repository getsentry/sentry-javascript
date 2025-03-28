import { isWrapped } from '@opentelemetry/core';
import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
} from '@opentelemetry/instrumentation';
import { SDK_VERSION, captureException, startSpan } from '@sentry/core';
import { getEventSpanOptions } from './helpers';
import type { OnEventTarget } from './types';

const supportedVersions = ['>=2.0.0'];
const COMPONENT = '@nestjs/event-emitter';

/**
 * Custom instrumentation for nestjs event-emitter
 *
 * This hooks into the `OnEvent` decorator, which is applied on event handlers.
 */
export class SentryNestEventInstrumentation extends InstrumentationBase {
  public constructor(config: InstrumentationConfig = {}) {
    super('sentry-nestjs-event', SDK_VERSION, config);
  }

  /**
   * Initializes the instrumentation by defining the modules to be patched.
   */
  public init(): InstrumentationNodeModuleDefinition {
    const moduleDef = new InstrumentationNodeModuleDefinition(COMPONENT, supportedVersions);

    moduleDef.files.push(this._getOnEventFileInstrumentation(supportedVersions));
    return moduleDef;
  }

  /**
   * Wraps the @OnEvent decorator.
   */
  private _getOnEventFileInstrumentation(versions: string[]): InstrumentationNodeModuleFile {
    return new InstrumentationNodeModuleFile(
      '@nestjs/event-emitter/dist/decorators/on-event.decorator.js',
      versions,
      (moduleExports: { OnEvent: OnEventTarget }) => {
        if (isWrapped(moduleExports.OnEvent)) {
          this._unwrap(moduleExports, 'OnEvent');
        }
        this._wrap(moduleExports, 'OnEvent', this._createWrapOnEvent());
        return moduleExports;
      },
      (moduleExports: { OnEvent: OnEventTarget }) => {
        this._unwrap(moduleExports, 'OnEvent');
      },
    );
  }

  /**
   * Creates a wrapper function for the @OnEvent decorator.
   */
  private _createWrapOnEvent() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return function wrapOnEvent(original: any) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return function wrappedOnEvent(event: any, options?: any) {
        const eventName = Array.isArray(event)
          ? event.join(',')
          : typeof event === 'string' || typeof event === 'symbol'
            ? event.toString()
            : '<unknown_event>';

        // Get the original decorator result
        const decoratorResult = original(event, options);

        // Return a new decorator function that wraps the handler
        return function (target: OnEventTarget, propertyKey: string | symbol, descriptor: PropertyDescriptor) {
          if (!descriptor.value || typeof descriptor.value !== 'function' || target.__SENTRY_INTERNAL__) {
            return decoratorResult(target, propertyKey, descriptor);
          }

          // Get the original handler
          const originalHandler = descriptor.value;
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          const handlerName = originalHandler.name || propertyKey;

          // Instrument the handler
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          descriptor.value = async function (...args: any[]) {
            return startSpan(getEventSpanOptions(eventName), async () => {
              try {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                const result = await originalHandler.apply(this, args);
                return result;
              } catch (error) {
                // exceptions from event handlers are not caught by global error filter
                captureException(error);
                throw error;
              }
            });
          };

          // Preserve the original function name
          Object.defineProperty(descriptor.value, 'name', {
            value: handlerName,
            configurable: true,
          });

          // Apply the original decorator
          return decoratorResult(target, propertyKey, descriptor);
        };
      };
    };
  }
}
