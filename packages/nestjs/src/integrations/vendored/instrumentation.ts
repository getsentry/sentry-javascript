/*
 * Copyright The OpenTelemetry Authors
 *
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
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-nestjs-core
 * - Upstream version: @opentelemetry/instrumentation-nestjs-core@0.64.0
 * - Some types vendored from @nestjs/core and @nestjs/common with simplifications
 */
/* eslint-disable */

import * as api from '@opentelemetry/api';
import {
  InstrumentationBase,
  InstrumentationConfig,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
  isWrapped,
  SemconvStability,
  semconvStabilityFromStr,
} from '@opentelemetry/instrumentation';
import { ATTR_HTTP_REQUEST_METHOD, ATTR_HTTP_ROUTE, ATTR_URL_FULL } from '@opentelemetry/semantic-conventions';
import { SDK_VERSION } from '@sentry/core';
import { ATTR_HTTP_METHOD, ATTR_HTTP_URL } from './semconv';
import { AttributeNames, NestType } from './enums';

const PACKAGE_NAME = '@sentry/instrumentation-nestjs-core';

// Simplified types inlined from @nestjs/core and @nestjs/common to avoid requiring these packages.
// Controller: exact copy from @nestjs/common/interfaces/controllers/controller.interface.d.ts
type Controller = object;

// NestFactory: simplified from @nestjs/core/nest-factory.d.ts — only the create method is used.
// Declared as a const (matching the original export shape) so `typeof NestFactory` works.
declare const NestFactory: {
  create(...args: any[]): Promise<any>;
};

// RouterExecutionContext: simplified from @nestjs/core/router/router-execution-context.d.ts — only the create method is used.
interface RouterExecutionContext {
  create(instance: Controller, callback: (...args: any[]) => unknown, ...args: any[]): any;
}

// Reflect metadata API (provided by reflect-metadata at runtime, used by NestJS)
declare namespace Reflect {
  function getMetadataKeys(target: any): any[];
  function getMetadata(metadataKey: any, target: any): any;
  function defineMetadata(metadataKey: any, metadataValue: any, target: any): void;
}

const supportedVersions = ['>=4.0.0 <12'];

export class NestInstrumentation extends InstrumentationBase {
  static readonly COMPONENT = '@nestjs/core';
  static readonly COMMON_ATTRIBUTES = {
    component: NestInstrumentation.COMPONENT,
  };

  private _semconvStability: SemconvStability;

  constructor(config: InstrumentationConfig = {}) {
    super(PACKAGE_NAME, SDK_VERSION, config);
    this._semconvStability = semconvStabilityFromStr('http', process.env.OTEL_SEMCONV_STABILITY_OPT_IN);
  }

  init() {
    const module = new InstrumentationNodeModuleDefinition(NestInstrumentation.COMPONENT, supportedVersions);

    module.files.push(
      this.getNestFactoryFileInstrumentation(supportedVersions),
      this.getRouterExecutionContextFileInstrumentation(supportedVersions),
    );

    return module;
  }

  getNestFactoryFileInstrumentation(versions: string[]) {
    return new InstrumentationNodeModuleFile(
      '@nestjs/core/nest-factory.js',
      versions,
      (NestFactoryStatic: any, moduleVersion?: string) => {
        this.ensureWrapped(
          NestFactoryStatic.NestFactoryStatic.prototype,
          'create',
          createWrapNestFactoryCreate(this.tracer, moduleVersion),
        );
        return NestFactoryStatic;
      },
      (NestFactoryStatic: any) => {
        this._unwrap(NestFactoryStatic.NestFactoryStatic.prototype, 'create');
      },
    );
  }

  getRouterExecutionContextFileInstrumentation(versions: string[]) {
    return new InstrumentationNodeModuleFile(
      '@nestjs/core/router/router-execution-context.js',
      versions,
      (RouterExecutionContext: any, moduleVersion?: string) => {
        this.ensureWrapped(
          RouterExecutionContext.RouterExecutionContext.prototype,
          'create',
          createWrapCreateHandler(this.tracer, moduleVersion, this._semconvStability),
        );
        return RouterExecutionContext;
      },
      (RouterExecutionContext: any) => {
        this._unwrap(RouterExecutionContext.RouterExecutionContext.prototype, 'create');
      },
    );
  }

  private ensureWrapped(obj: any, methodName: string, wrapper: (original: any) => any) {
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
      nestModule: any,
      /* serverOrOptions */
    ) {
      const span = tracer.startSpan('Create Nest App', {
        attributes: {
          ...NestInstrumentation.COMMON_ATTRIBUTES,
          [AttributeNames.TYPE]: NestType.APP_CREATION,
          [AttributeNames.VERSION]: moduleVersion,
          [AttributeNames.MODULE]: nestModule.name,
        },
      });
      const spanContext = api.trace.setSpan(api.context.active(), span);

      return api.context.with(spanContext, async () => {
        try {
          return await original.apply(this, arguments as any);
        } catch (e: any) {
          throw addError(span, e);
        } finally {
          span.end();
        }
      });
    };
  };
}

function createWrapCreateHandler(
  tracer: api.Tracer,
  moduleVersion: string | undefined,
  semconvStability: SemconvStability,
) {
  return function wrapCreateHandler(original: RouterExecutionContext['create']) {
    return function createHandlerWithTrace(
      this: RouterExecutionContext,
      instance: Controller,
      callback: (...args: any[]) => unknown,
    ) {
      arguments[1] = createWrapHandler(tracer, moduleVersion, callback);
      const handler = original.apply(this, arguments as any);
      const callbackName = callback.name;
      const instanceName =
        instance.constructor && instance.constructor.name ? instance.constructor.name : 'UnnamedInstance';
      const spanName = callbackName ? `${instanceName}.${callbackName}` : instanceName;

      return function (this: any, req: any, res: any, next: (...args: any[]) => unknown) {
        const attributes: api.Attributes = {
          ...NestInstrumentation.COMMON_ATTRIBUTES,
          [AttributeNames.VERSION]: moduleVersion,
          [AttributeNames.TYPE]: NestType.REQUEST_CONTEXT,
          [ATTR_HTTP_ROUTE]: req.route?.path || req.routeOptions?.url || req.routerPath,
          [AttributeNames.CONTROLLER]: instanceName,
          [AttributeNames.CALLBACK]: callbackName,
        };
        if (semconvStability & SemconvStability.OLD) {
          attributes[ATTR_HTTP_METHOD] = req.method;
          attributes[ATTR_HTTP_URL] = req.originalUrl || req.url;
        }
        if (semconvStability & SemconvStability.STABLE) {
          attributes[ATTR_HTTP_REQUEST_METHOD] = req.method;
          attributes[ATTR_URL_FULL] = req.originalUrl || req.url;
        }
        const span = tracer.startSpan(spanName, { attributes });
        const spanContext = api.trace.setSpan(api.context.active(), span);

        return api.context.with(spanContext, async () => {
          try {
            return await handler.apply(this, arguments as any);
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

function createWrapHandler(tracer: api.Tracer, moduleVersion: string | undefined, handler: Function) {
  const spanName = handler.name || 'anonymous nest handler';
  const options = {
    attributes: {
      ...NestInstrumentation.COMMON_ATTRIBUTES,
      [AttributeNames.VERSION]: moduleVersion,
      [AttributeNames.TYPE]: NestType.REQUEST_HANDLER,
      [AttributeNames.CALLBACK]: handler.name,
    },
  };
  const wrappedHandler = function (this: RouterExecutionContext) {
    const span = tracer.startSpan(spanName, options);
    const spanContext = api.trace.setSpan(api.context.active(), span);

    return api.context.with(spanContext, async () => {
      try {
        return await handler.apply(this, arguments);
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

const addError = (span: api.Span, error: Error) => {
  span.recordException(error);
  span.setStatus({ code: api.SpanStatusCode.ERROR, message: error.message });
  return error;
};
