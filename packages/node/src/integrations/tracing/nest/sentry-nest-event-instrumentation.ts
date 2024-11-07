import { isWrapped } from '@opentelemetry/core';
import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
} from '@opentelemetry/instrumentation';
import { SDK_VERSION } from '@sentry/utils';
import type { OnEventTarget } from './types';

const supportedVersions = ['>=2.0.0'];

/**
 * Custom instrumentation for nestjs event-emitter
 *
 * This hooks into the `OnEvent` decorator, which is applied on event handlers.
 */
export class SentryNestEventInstrumentation extends InstrumentationBase {
  public static readonly COMPONENT = '@nestjs/event-emitter';
  public static readonly COMMON_ATTRIBUTES = {
    component: SentryNestEventInstrumentation.COMPONENT,
  };

  public constructor(config: InstrumentationConfig = {}) {
    super('sentry-nestjs-event', SDK_VERSION, config);
  }

  /**
   * Initializes the instrumentation by defining the modules to be patched.
   */
  public init(): InstrumentationNodeModuleDefinition {
    // eslint-disable-next-line no-console
    console.log(32);
    const moduleDef = new InstrumentationNodeModuleDefinition(
      SentryNestEventInstrumentation.COMPONENT,
      supportedVersions,
    );

    moduleDef.files.push(this._getOnEventFileInstrumentation(supportedVersions));
    return moduleDef;
  }

  /**
   * Wraps the @OnEvent decorator.
   */
  private _getOnEventFileInstrumentation(versions: string[]): InstrumentationNodeModuleFile {
    // eslint-disable-next-line no-console
    console.log(46);
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
      return function wrappedOnEvent(target: OnEventTarget) {
        return function (name: string) {
          return function () {
            // eslint-disable-next-line no-console
            console.log('wrappedOnEvent', name);
            return original(name)(target);
          };
        };
      };
    };
  }
}
