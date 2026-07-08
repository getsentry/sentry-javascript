/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-nestjs-core
 * - Upstream version: @opentelemetry/instrumentation-nestjs-core@0.64.0
 * - Some types vendored from @nestjs/core and @nestjs/common with simplifications
 * - The span-emitting logic (app-creation / request-context / request-handler
 *   spans) has been extracted to `../wrappers` and is shared with the
 *   orchestrion (diagnostics-channel) path; this file only wraps the
 *   `NestFactory.create` / `RouterExecutionContext.create` methods to feed into it.
 */
import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
  isWrapped,
} from '@opentelemetry/instrumentation';
import { SDK_VERSION, startSpan } from '@sentry/core';
import type { AnyFn } from '../helpers';
import { getAppCreationSpanOptions, wrapRequestContextHandler, wrapRouteHandler } from '../wrap-route';

const PACKAGE_NAME = '@sentry/instrumentation-nestjs-core';

type Controller = object;

declare const NestFactory: {
  create(...args: unknown[]): Promise<unknown>;
};

interface RouterExecutionContext {
  create(instance: Controller, callback: (...args: unknown[]) => unknown, ...args: unknown[]): unknown;
}

const supportedVersions = ['>=4.0.0 <12'];

export class NestInstrumentation extends InstrumentationBase {
  static readonly COMPONENT = '@nestjs/core';

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
          createWrapNestFactoryCreate(moduleVersion),
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
          createWrapCreateHandler(moduleVersion),
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

function createWrapNestFactoryCreate(moduleVersion?: string) {
  return function wrapCreate(original: typeof NestFactory.create): typeof NestFactory.create {
    return function createWithTrace(this: typeof NestFactory, ...args: unknown[]) {
      const nestModule = args[0] as { name?: string };
      return startSpan(getAppCreationSpanOptions(moduleVersion, nestModule?.name), () => original.apply(this, args));
    };
  };
}

function createWrapCreateHandler(moduleVersion: string | undefined) {
  return function wrapCreateHandler(original: RouterExecutionContext['create']): RouterExecutionContext['create'] {
    return function createHandlerWithTrace(this: RouterExecutionContext, ...args: unknown[]) {
      const instance = args[0] as { constructor?: { name?: string } };
      const callback = args[1] as AnyFn;
      const instanceName = instance?.constructor?.name || 'UnnamedInstance';
      const callbackName = typeof callback === 'function' ? callback.name : '';
      args[1] = wrapRouteHandler(callback, moduleVersion);
      const handler = original.apply(this, args) as AnyFn;
      return wrapRequestContextHandler(handler, instanceName, callbackName, moduleVersion);
    };
  };
}
