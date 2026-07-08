import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
  isWrapped,
} from '@opentelemetry/instrumentation';
import { SDK_VERSION } from '@sentry/core';
import type { AnyFn } from './helpers';
import type { OnEventTarget } from './types';
import { patchMethodDescriptor, wrapEventHandler } from './wrap-handlers';

const supportedVersions = ['>=2.0.0'];
const COMPONENT = '@nestjs/event-emitter';

/**
 * Custom instrumentation for nestjs event-emitter
 *
 * This hooks into the `OnEvent` decorator, which is applied on event handlers.
 * Wrapped handlers run inside a forked isolation scope to ensure event-scoped data
 * (breadcrumbs, tags, etc.) does not leak between concurrent event invocations
 * or into subsequent HTTP requests.
 *
 * The handler-wrapping logic lives in `./wrappers` and is shared with the orchestrion
 * (diagnostics-channel) path.
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
        const decoratorResult = original(event, options);

        return (target: OnEventTarget, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
          patchMethodDescriptor(target, propertyKey, descriptor, (handler: AnyFn) => wrapEventHandler(handler, event));
          return decoratorResult(target, propertyKey, descriptor);
        };
      };
    };
  }
}
