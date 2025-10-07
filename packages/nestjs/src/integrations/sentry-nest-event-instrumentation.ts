import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
  isWrapped,
} from '@opentelemetry/instrumentation';
import { captureException, SDK_VERSION, startSpan } from '@sentry/core';
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
      return function wrappedOnEvent(event: unknown, options?: unknown) {
        // Get the original decorator result
        const decoratorResult = original(event, options);

        // Return a new decorator function that wraps the handler
        return (target: OnEventTarget, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
          if (
            !descriptor.value ||
            typeof descriptor.value !== 'function' ||
            target.__SENTRY_INTERNAL__ ||
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            descriptor.value.__SENTRY_INSTRUMENTED__
          ) {
            return decoratorResult(target, propertyKey, descriptor);
          }

          function eventNameFromEvent(event: unknown): string {
            if (typeof event === 'string') {
              return event;
            } else if (Array.isArray(event)) {
              return event.map(eventNameFromEvent).join(',');
            } else return String(event);
          }

          const originalHandler = descriptor.value;
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          const handlerName = originalHandler.name || propertyKey;
          let eventName = eventNameFromEvent(event);

          // Instrument the actual handler
          descriptor.value = async function (...args: unknown[]) {
            // When multiple @OnEvent decorators are used on a single method, we need to get all event names
            // from the reflector metadata as there is no information during execution which event triggered it
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore - reflect-metadata of nestjs adds these methods to Reflect
            if (Reflect.getMetadataKeys(descriptor.value).includes('EVENT_LISTENER_METADATA')) {
              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              // @ts-ignore - reflect-metadata of nestjs adds these methods to Reflect
              const eventData = Reflect.getMetadata('EVENT_LISTENER_METADATA', descriptor.value);
              if (Array.isArray(eventData)) {
                eventName = eventData
                  .map((data: unknown) => {
                    if (data && typeof data === 'object' && 'event' in data && data.event) {
                      return eventNameFromEvent(data.event);
                    }
                    return '';
                  })
                  .reverse() // decorators are evaluated bottom to top
                  .join('|');
              }
            }

            return startSpan(getEventSpanOptions(eventName), async () => {
              try {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                const result = await originalHandler.apply(this, args);
                return result;
              } catch (error) {
                // exceptions from event handlers are not caught by global error filter
                captureException(error, {
                  mechanism: {
                    handled: false,
                    type: 'auto.event.nestjs',
                  },
                });
                throw error;
              }
            });
          };

          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          descriptor.value.__SENTRY_INSTRUMENTED__ = true;

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
