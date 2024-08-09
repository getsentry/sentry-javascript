import { isWrapped } from '@opentelemetry/core';
import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
} from '@opentelemetry/instrumentation';
import { captureException } from '@sentry/core';
import { SDK_VERSION } from '@sentry/utils';
import type { BaseExceptionFilter } from './types';

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
    const moduleDef = new InstrumentationNodeModuleDefinition(
      SentryNestErrorInstrumentation.COMPONENT,
      supportedVersions,
    );

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
        if (isWrapped(moduleExports.BaseExceptionFilter.prototype)) {
          this._unwrap(moduleExports.BaseExceptionFilter.prototype, 'catch');
        }
        this._wrap(moduleExports.BaseExceptionFilter.prototype, 'catch', this._createWrapCatch());
        return moduleExports;
      },
      (moduleExports: { BaseExceptionFilter: BaseExceptionFilter }) => {
        this._unwrap(moduleExports.BaseExceptionFilter.prototype, 'catch');
      },
    );
  }

  /**
   *
   */
  private _createWrapCatch() {
    return function wrapCatch(originalCatch: (exception: unknown, host: unknown) => void) {
      return function wrappedCatch(this: BaseExceptionFilter, exception: unknown, host: unknown) {
        const exceptionIsObject = typeof exception === 'object' && exception !== null;
        const exceptionStatusCode = exceptionIsObject && 'status' in exception ? exception.status : null;
        const exceptionErrorProperty = exceptionIsObject && 'error' in exception ? exception.error : null;

        /*
        Don't report expected NestJS control flow errors
        - `HttpException` errors will have a `status` property
        - `RpcException` errors will have an `error` property
         */
        if (exceptionStatusCode !== null || exceptionErrorProperty !== null) {
          return originalCatch.apply(this, [exception, host]);
        }

        captureException(exception);

        return originalCatch.apply(this, [exception, host]);
      };
    };
  }
}
