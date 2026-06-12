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
import * as api from '@opentelemetry/api';
import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
  isWrapped,
} from '@opentelemetry/instrumentation';
import { HTTP_ROUTE } from '@sentry/conventions/attributes';
import { SDK_VERSION } from '@sentry/core';
import { AttributeNames, NestType } from './enums';

const PACKAGE_NAME = '@sentry/instrumentation-nestjs-core';

type AnyFn = (this: unknown, ...args: unknown[]) => unknown;

type Controller = object;

declare const NestFactory: {
  create(...args: unknown[]): Promise<unknown>;
};

interface RouterExecutionContext {
  create(instance: Controller, callback: (...args: unknown[]) => unknown, ...args: unknown[]): unknown;
}

interface NestRequest {
  route?: { path?: string };
  routeOptions?: { url?: string };
  routerPath?: string;
  method?: string;
  originalUrl?: string;
  url?: string;
}

declare namespace Reflect {
  function getMetadataKeys(target: unknown): unknown[];
  function getMetadata(metadataKey: unknown, target: unknown): unknown;
  function defineMetadata(metadataKey: unknown, metadataValue: unknown, target: unknown): void;
}

const supportedVersions = ['>=4.0.0 <12'];

export class NestInstrumentation extends InstrumentationBase {
  static readonly COMPONENT = '@nestjs/core';
  static readonly COMMON_ATTRIBUTES = {
    component: NestInstrumentation.COMPONENT,
  };

  constructor(config: InstrumentationConfig = {}) {
    super(PACKAGE_NAME, SDK_VERSION, config);
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
      (moduleExports: { NestFactoryStatic: { prototype: typeof NestFactory } }, moduleVersion?: string) => {
        this.ensureWrapped(
          moduleExports.NestFactoryStatic.prototype,
          'create',
          createWrapNestFactoryCreate(this.tracer, moduleVersion),
        );
        return moduleExports;
      },
      (moduleExports: { NestFactoryStatic: { prototype: typeof NestFactory } }) => {
        this._unwrap(moduleExports.NestFactoryStatic.prototype, 'create');
      },
    );
  }

  getRouterExecutionContextFileInstrumentation(versions: string[]) {
    return new InstrumentationNodeModuleFile(
      '@nestjs/core/router/router-execution-context.js',
      versions,
      (moduleExports: { RouterExecutionContext: { prototype: RouterExecutionContext } }, moduleVersion?: string) => {
        this.ensureWrapped(
          moduleExports.RouterExecutionContext.prototype,
          'create',
          createWrapCreateHandler(this.tracer, moduleVersion),
        );
        return moduleExports;
      },
      (moduleExports: { RouterExecutionContext: { prototype: RouterExecutionContext } }) => {
        this._unwrap(moduleExports.RouterExecutionContext.prototype, 'create');
      },
    );
  }

  private ensureWrapped<T extends object, K extends keyof T>(
    obj: T,
    methodName: K,
    wrapper: (original: T[K]) => T[K],
  ): void {
    if (isWrapped(obj[methodName])) {
      this._unwrap(obj, methodName);
    }
    this._wrap(obj, methodName, wrapper);
  }
}

function createWrapNestFactoryCreate(tracer: api.Tracer, moduleVersion?: string) {
  return function wrapCreate(original: typeof NestFactory.create): typeof NestFactory.create {
    return function createWithTrace(this: typeof NestFactory, ...args: unknown[]) {
      const nestModule = args[0] as { name?: string };
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
          return await original.apply(this, args);
        } catch (e) {
          throw addError(span, e as Error);
        } finally {
          span.end();
        }
      });
    };
  };
}

function createWrapCreateHandler(tracer: api.Tracer, moduleVersion: string | undefined) {
  return function wrapCreateHandler(original: RouterExecutionContext['create']): RouterExecutionContext['create'] {
    return function createHandlerWithTrace(this: RouterExecutionContext, ...args: unknown[]) {
      const instance = args[0] as { constructor?: { name?: string } };
      const callback = args[1] as AnyFn;
      args[1] = createWrapHandler(tracer, moduleVersion, callback);
      const handler = original.apply(this, args) as AnyFn;
      const callbackName = callback.name;
      const instanceName = instance.constructor?.name || 'UnnamedInstance';
      const spanName = callbackName ? `${instanceName}.${callbackName}` : instanceName;

      return function (this: unknown, ...handlerArgs: unknown[]) {
        const req = handlerArgs[0] as NestRequest;
        const attributes: api.Attributes = {
          ...NestInstrumentation.COMMON_ATTRIBUTES,
          [AttributeNames.VERSION]: moduleVersion,
          [AttributeNames.TYPE]: NestType.REQUEST_CONTEXT,
          [HTTP_ROUTE]: req.route?.path || req.routeOptions?.url || req.routerPath,
          [AttributeNames.CONTROLLER]: instanceName,
          [AttributeNames.CALLBACK]: callbackName,
        };
        attributes['http.method'] = req.method;
        attributes['http.url'] = req.originalUrl || req.url;
        const span = tracer.startSpan(spanName, { attributes });
        const spanContext = api.trace.setSpan(api.context.active(), span);

        return api.context.with(spanContext, async () => {
          try {
            return await handler.apply(this, handlerArgs);
          } catch (e) {
            throw addError(span, e as Error);
          } finally {
            span.end();
          }
        });
      };
    };
  };
}

function createWrapHandler(tracer: api.Tracer, moduleVersion: string | undefined, handler: AnyFn): AnyFn {
  const spanName = handler.name || 'anonymous nest handler';
  const options = {
    attributes: {
      ...NestInstrumentation.COMMON_ATTRIBUTES,
      [AttributeNames.VERSION]: moduleVersion,
      [AttributeNames.TYPE]: NestType.REQUEST_HANDLER,
      [AttributeNames.CALLBACK]: handler.name,
    },
  };
  const wrappedHandler = function (this: unknown, ...args: unknown[]) {
    const span = tracer.startSpan(spanName, options);
    const spanContext = api.trace.setSpan(api.context.active(), span);

    return api.context.with(spanContext, async () => {
      try {
        return await handler.apply(this, args);
      } catch (e) {
        throw addError(span, e as Error);
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
