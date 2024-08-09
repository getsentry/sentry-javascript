import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
} from '@opentelemetry/instrumentation';
import { SDK_VERSION } from '@sentry/utils';
import type {BaseExceptionFilter} from './types';
import {isWrapped} from "@opentelemetry/core";

const supportedVersions = ['>=8.0.0 <11'];

/**
 *
 */
export class SentryNestErrorInstrumentation extends InstrumentationBase {
  public static readonly COMPONENT = '@nestjs/core';
  public static readonly COMMON_ATTRIBUTES = {
    component: SentryNestErrorInstrumentation.COMPONENT,
  };

  public constructor(config: InstrumentationConfig = {}) {
    super('sentry-nestjs-error', SDK_VERSION, config);
  }

  /**
   *
   */
  public init(): InstrumentationNodeModuleDefinition {
    const moduleDef = new InstrumentationNodeModuleDefinition(SentryNestErrorInstrumentation.COMPONENT, supportedVersions);

    moduleDef.files.push(this._getBaseExceptionFilterFileInstrumentation(supportedVersions));

    return moduleDef;
  }

  /**
   *
   */
  private _getBaseExceptionFilterFileInstrumentation(versions: string[]): InstrumentationNodeModuleFile {
    return new InstrumentationNodeModuleFile(
      '@nestjs/core/exceptions/base-exception-filter.js',
      versions,
      (moduleExports: { BaseExceptionFilter: BaseExceptionFilter }) => {
        console.log('exports:');
        console.log(moduleExports);
        console.log('prototype: ');
        console.log(moduleExports.BaseExceptionFilter.prototype);
        console.log('catch: ');
        console.log(moduleExports.BaseExceptionFilter.prototype.catch);

        if (isWrapped(moduleExports.BaseExceptionFilter.prototype)) {
          this._unwrap(moduleExports.BaseExceptionFilter.prototype, 'catch');
        }
        console.log('wrap');
        this._wrap(moduleExports.BaseExceptionFilter.prototype, 'catch', this._createWrapCatch());
        return moduleExports;
      },
      (moduleExports: { BaseExceptionFilter: BaseExceptionFilter }) => {
        this._unwrap(moduleExports.BaseExceptionFilter.prototype, 'catch');
      }
    );
  }

  /**
   *
   */
  private _createWrapCatch() {
    console.log('in wrap');
    return function wrapCatch(originalCatch: (exception: unknown, host: unknown) => void) {
      return function wrappedCatch(this: any, exception: unknown, host: unknown) {
        console.log('patching the base exception filter!');

        console.log(exception);
        return originalCatch.apply(this, [exception, host]);
        /*
        return new Proxy(originalCatch, {
          apply: (originalCatch, thisArgCatch, argsCatch) => {
            console.log('patching the base exception filter!');
            return originalCatch.apply(thisArgCatch, argsCatch);
          }
        })

         */
      }
    }
  }
}
