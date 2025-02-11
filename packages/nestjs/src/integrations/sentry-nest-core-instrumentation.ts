/*
 * This file is based on code from the OpenTelemetry Authors
 * Source: https://github.com/open-telemetry/opentelemetry-js-contrib
 *
 * Modified for immediate requirements while maintaining compliance
 * with the original Apache 2.0 license terms.
 *
 * Original License:
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { Controller } from '@nestjs/common/interfaces';
import type { NestFactory } from '@nestjs/core/nest-factory.js';
import type { RouterExecutionContext } from '@nestjs/core/router/router-execution-context.js';
import * as api from '@opentelemetry/api';
import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
  isWrapped,
} from '@opentelemetry/instrumentation';
import { ATTR_HTTP_REQUEST_METHOD, ATTR_HTTP_ROUTE, SEMATTRS_HTTP_URL } from '@opentelemetry/semantic-conventions';

import { SDK_VERSION } from '@sentry/core';

const supportedVersions = ['>=4.0.0 <12'];
const COMPONENT = '@nestjs/core';

enum AttributeNames {
  VERSION = 'nestjs.version',
  TYPE = 'nestjs.type',
  MODULE = 'nestjs.module',
  CONTROLLER = 'nestjs.controller',
  CALLBACK = 'nestjs.callback',
  PIPES = 'nestjs.pipes',
  INTERCEPTORS = 'nestjs.interceptors',
  GUARDS = 'nestjs.guards',
}

export enum NestType {
  APP_CREATION = 'app_creation',
  REQUEST_CONTEXT = 'request_context',
  REQUEST_HANDLER = 'handler',
}

/**
 *
 */
export class NestInstrumentation extends InstrumentationBase {
  public constructor(config: InstrumentationConfig = {}) {
    super('sentry-nestjs', SDK_VERSION, config);
  }

  /**
   *
   */
  public init(): InstrumentationNodeModuleDefinition {
    const module = new InstrumentationNodeModuleDefinition(COMPONENT, supportedVersions);

    module.files.push(
      this._getNestFactoryFileInstrumentation(supportedVersions),
      this._getRouterExecutionContextFileInstrumentation(supportedVersions),
    );

    return module;
  }

  /**
   *
   */
  private _getNestFactoryFileInstrumentation(versions: string[]): InstrumentationNodeModuleFile {
    return new InstrumentationNodeModuleFile(
      '@nestjs/core/nest-factory.js',
      versions,
      // todo
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (NestFactoryStatic: any, moduleVersion?: string) => {
        this._ensureWrapped(
          // todo
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          NestFactoryStatic.NestFactoryStatic.prototype,
          'create',
          createWrapNestFactoryCreate(this.tracer, moduleVersion),
        );
        return NestFactoryStatic;
      },
      // todo
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (NestFactoryStatic: any) => {
        // todo
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        this._unwrap(NestFactoryStatic.NestFactoryStatic.prototype, 'create');
      },
    );
  }

  /**
   *
   */
  private _getRouterExecutionContextFileInstrumentation(versions: string[]): InstrumentationNodeModuleFile {
    return new InstrumentationNodeModuleFile(
      '@nestjs/core/router/router-execution-context.js',
      versions,
      // todo
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (RouterExecutionContext: any, moduleVersion?: string) => {
        this._ensureWrapped(
          // todo
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          RouterExecutionContext.RouterExecutionContext.prototype,
          'create',
          createWrapCreateHandler(this.tracer, moduleVersion),
        );
        return RouterExecutionContext;
      },
      // todo
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (RouterExecutionContext: any) => {
        // todo
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        this._unwrap(RouterExecutionContext.RouterExecutionContext.prototype, 'create');
      },
    );
  }

  /**
   *
   */
  // todo
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _ensureWrapped(obj: any, methodName: string, wrapper: (original: any) => any): void {
    // todo
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (isWrapped(obj[methodName])) {
      this._unwrap(obj, methodName);
    }
    this._wrap(obj, methodName, wrapper);
  }
}

function createWrapNestFactoryCreate(tracer: api.Tracer, moduleVersion?: string) {
  return function wrapCreate(original: typeof NestFactory.create) {
    return function createWithTrace(
      this: typeof NestFactory,
      // todo
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      nestModule: any,
      /* serverOrOptions */
    ) {
      const span = tracer.startSpan('Create Nest App', {
        attributes: {
          component: COMPONENT,
          [AttributeNames.TYPE]: NestType.APP_CREATION,
          [AttributeNames.VERSION]: moduleVersion,
          // todo
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          [AttributeNames.MODULE]: nestModule.name,
        },
      });
      const spanContext = api.trace.setSpan(api.context.active(), span);

      return api.context.with(spanContext, async () => {
        try {
          // todo
          // eslint-disable-next-line prefer-rest-params, @typescript-eslint/no-explicit-any
          return await original.apply(this, arguments as any);
          // todo
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (e: any) {
          throw addError(span, e);
        } finally {
          span.end();
        }
      });
    };
  };
}

function createWrapCreateHandler(tracer: api.Tracer, moduleVersion?: string) {
  return function wrapCreateHandler(original: RouterExecutionContext['create']) {
    return function createHandlerWithTrace(
      this: RouterExecutionContext,
      instance: Controller,
      // todo
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      callback: (...args: any[]) => unknown,
    ) {
      // todo
      // eslint-disable-next-line prefer-rest-params
      arguments[1] = createWrapHandler(tracer, moduleVersion, callback);
      // todo
      // eslint-disable-next-line prefer-rest-params, @typescript-eslint/no-explicit-any
      const handler = original.apply(this, arguments as any);
      const callbackName = callback.name;
      const instanceName =
        // todo
        // eslint-disable-next-line @typescript-eslint/prefer-optional-chain
        instance.constructor && instance.constructor.name ? instance.constructor.name : 'UnnamedInstance';
      const spanName = callbackName ? `${instanceName}.${callbackName}` : instanceName;

      // todo
      // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
      return function (this: any, req: any, res: any, next: (...args: any[]) => unknown) {
        const span = tracer.startSpan(spanName, {
          attributes: {
            component: COMPONENT,
            [AttributeNames.VERSION]: moduleVersion,
            [AttributeNames.TYPE]: NestType.REQUEST_CONTEXT,
            // todo
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            [ATTR_HTTP_REQUEST_METHOD]: req.method,
            // todo
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, deprecation/deprecation
            [SEMATTRS_HTTP_URL]: req.originalUrl || req.url,
            // todo
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            [ATTR_HTTP_ROUTE]: req.route?.path || req.routeOptions?.url || req.routerPath,
            [AttributeNames.CONTROLLER]: instanceName,
            [AttributeNames.CALLBACK]: callbackName,
          },
        });
        const spanContext = api.trace.setSpan(api.context.active(), span);

        return api.context.with(spanContext, async () => {
          try {
            // todo
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, prefer-rest-params
            return await handler.apply(this, arguments as unknown);
            // todo
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } catch (e: any) {
            throw addError(span, e);
          } finally {
            span.end();
          }
        });
      };
    };
  };
}

function createWrapHandler(
  tracer: api.Tracer,
  moduleVersion: string | undefined,
  // todo
  // eslint-disable-next-line @typescript-eslint/ban-types
  handler: Function,
  // todo
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): (this: RouterExecutionContext) => Promise<any> {
  const spanName = handler.name || 'anonymous nest handler';
  const options = {
    attributes: {
      component: COMPONENT,
      [AttributeNames.VERSION]: moduleVersion,
      [AttributeNames.TYPE]: NestType.REQUEST_HANDLER,
      [AttributeNames.CALLBACK]: handler.name,
    },
  };
  // todo
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wrappedHandler = function (this: RouterExecutionContext): Promise<any> {
    const span = tracer.startSpan(spanName, options);
    const spanContext = api.trace.setSpan(api.context.active(), span);

    return api.context.with(spanContext, async () => {
      try {
        // todo
        // eslint-disable-next-line prefer-rest-params
        return await handler.apply(this, arguments);
        // todo
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (e: any) {
        throw addError(span, e);
      } finally {
        span.end();
      }
    });
  };

  if (handler.name) {
    Object.defineProperty(wrappedHandler, 'name', { value: handler.name });
  }

  // Get the current metadata and set onto the wrapper to ensure other decorators ( ie: NestJS EventPattern / RolesGuard )
  // won't be affected by the use of this instrumentation
  Reflect.getMetadataKeys(handler).forEach(metadataKey => {
    Reflect.defineMetadata(metadataKey, Reflect.getMetadata(metadataKey, handler), wrappedHandler);
  });
  return wrappedHandler;
}

const addError = (span: api.Span, error: Error): Error => {
  span.recordException(error);
  span.setStatus({ code: api.SpanStatusCode.ERROR, message: error.message });
  return error;
};
