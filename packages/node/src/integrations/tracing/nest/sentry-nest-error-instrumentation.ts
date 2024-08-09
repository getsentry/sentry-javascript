import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
} from '@opentelemetry/instrumentation';
import { SDK_VERSION } from '@sentry/utils';
import type {BaseExceptionFilter} from './types';

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


      },
      (BaseExceptionFilterClass: any) => {
        console.log('unpatch!');
      }
    );
  }
}
