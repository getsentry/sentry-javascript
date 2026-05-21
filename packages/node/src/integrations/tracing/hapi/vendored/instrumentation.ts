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
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-hapi
 * - Upstream version: @opentelemetry/instrumentation-hapi@0.64.0
 * - Types vendored from @hapi/hapi as simplified interfaces
 * - Minor TypeScript strictness adjustments for this repository's compiler settings
 */
/* eslint-disable */

import * as api from '@opentelemetry/api';
import { getRPCMetadata, RPCType } from '@opentelemetry/core';
import {
  InstrumentationBase,
  InstrumentationConfig,
  InstrumentationNodeModuleDefinition,
  isWrapped,
  SemconvStability,
  semconvStabilityFromStr,
} from '@opentelemetry/instrumentation';

import type * as Hapi from './hapi-types';
import { SDK_VERSION } from '@sentry/core';
import {
  HapiComponentName,
  HapiServerRouteInput,
  handlerPatched,
  PatchableServerRoute,
  HapiServerRouteInputMethod,
  HapiPluginInput,
  RegisterFunction,
  PatchableExtMethod,
  ServerExtDirectInput,
} from './internal-types';
import {
  getRouteMetadata,
  getPluginName,
  isLifecycleExtType,
  isLifecycleExtEventObj,
  getExtMetadata,
  isDirectExtInput,
  isPatchableExtMethod,
  getPluginFromInput,
} from './utils';

const PACKAGE_NAME = '@sentry/instrumentation-hapi';

/** Hapi instrumentation for OpenTelemetry */
export class HapiInstrumentation extends InstrumentationBase {
  private _semconvStability: SemconvStability;

  constructor(config: InstrumentationConfig = {}) {
    super(PACKAGE_NAME, SDK_VERSION, config);
    this._semconvStability = semconvStabilityFromStr('http', process.env.OTEL_SEMCONV_STABILITY_OPT_IN);
  }

  protected init() {
    return new InstrumentationNodeModuleDefinition(
      HapiComponentName,
      ['>=17.0.0 <22'],
      (module: any) => {
        const moduleExports: typeof Hapi = module[Symbol.toStringTag] === 'Module' ? module.default : module;
        if (!isWrapped(moduleExports.server)) {
          this._wrap(moduleExports, 'server', this._getServerPatch.bind(this) as any);
        }

        if (!isWrapped(moduleExports.Server)) {
          this._wrap(moduleExports, 'Server', this._getServerPatch.bind(this) as any);
        }
        return moduleExports;
      },
      (module: any) => {
        const moduleExports: typeof Hapi = module[Symbol.toStringTag] === 'Module' ? module.default : module;
        this._massUnwrap([moduleExports], ['server', 'Server']);
      },
    );
  }

  /**
   * Patches the Hapi.server and Hapi.Server functions in order to instrument
   * the server.route, server.ext, and server.register functions via calls to the
   * @function _getServerRoutePatch, @function _getServerExtPatch, and
   * @function _getServerRegisterPatch functions
   * @param original - the original Hapi Server creation function
   */
  private _getServerPatch(original: (options?: Hapi.ServerOptions) => Hapi.Server) {
    const instrumentation: HapiInstrumentation = this;
    const self = this;
    return function server(this: Hapi.Server, opts?: Hapi.ServerOptions) {
      const newServer: Hapi.Server = original.apply(this, [opts]);

      self._wrap(newServer, 'route', originalRouter => {
        return instrumentation._getServerRoutePatch.bind(instrumentation)(originalRouter);
      });

      // Casting as any is necessary here due to multiple overloads on the Hapi.ext
      // function, which requires supporting a variety of different parameters
      // as extension inputs
      self._wrap(newServer, 'ext', originalExtHandler => {
        return instrumentation._getServerExtPatch.bind(instrumentation)(originalExtHandler as any);
      });

      // Casting as any is necessary here due to multiple overloads on the Hapi.Server.register
      // function, which requires supporting a variety of different types of Plugin inputs
      self._wrap(newServer, 'register', instrumentation._getServerRegisterPatch.bind(instrumentation) as any);
      return newServer;
    };
  }

  /**
   * Patches the plugin register function used by the Hapi Server. This function
   * goes through each plugin that is being registered and adds instrumentation
   * via a call to the @function _wrapRegisterHandler function.
   * @param {RegisterFunction<T>} original - the original register function which
   * registers each plugin on the server
   */
  private _getServerRegisterPatch<T>(original: RegisterFunction<T>): RegisterFunction<T> {
    const instrumentation: HapiInstrumentation = this;
    return function register(this: Hapi.Server, pluginInput: HapiPluginInput<T>, options?: Hapi.ServerRegisterOptions) {
      if (Array.isArray(pluginInput)) {
        for (const pluginObj of pluginInput) {
          const plugin = getPluginFromInput(pluginObj);
          instrumentation._wrapRegisterHandler(plugin);
        }
      } else {
        const plugin = getPluginFromInput(pluginInput);
        instrumentation._wrapRegisterHandler(plugin);
      }
      return original.apply(this, [pluginInput, options]);
    };
  }

  /**
   * Patches the Server.ext function which adds extension methods to the specified
   * point along the request lifecycle. This function accepts the full range of
   * accepted input into the standard Hapi `server.ext` function. For each extension,
   * it adds instrumentation to the handler via a call to the @function _wrapExtMethods
   * function.
   * @param original - the original ext function which adds the extension method to the server
   * @param {string} [pluginName] - if present, represents the name of the plugin responsible
   * for adding this server extension. Else, signifies that the extension was added directly
   */
  private _getServerExtPatch(original: (...args: unknown[]) => unknown, pluginName?: string) {
    const instrumentation: HapiInstrumentation = this;

    return function ext(this: ThisParameterType<typeof original>, ...args: Parameters<typeof original>) {
      if (Array.isArray(args[0])) {
        const eventsList: Hapi.ServerExtEventsObject[] | Hapi.ServerExtEventsRequestObject[] = args[0];
        for (let i = 0; i < eventsList.length; i++) {
          const eventObj = eventsList[i]!;
          if (isLifecycleExtType(eventObj.type)) {
            const lifecycleEventObj = eventObj as Hapi.ServerExtEventsRequestObject;
            const handler = instrumentation._wrapExtMethods(lifecycleEventObj.method, eventObj.type, pluginName);
            lifecycleEventObj.method = handler;
            eventsList[i] = lifecycleEventObj;
          }
        }
        return original.apply(this, args);
      } else if (isDirectExtInput(args)) {
        const extInput: ServerExtDirectInput = args;
        const method: PatchableExtMethod = extInput[1];
        const handler = instrumentation._wrapExtMethods(method, extInput[0], pluginName);
        return original.apply(this, [extInput[0], handler, extInput[2]]);
      } else if (isLifecycleExtEventObj(args[0])) {
        const lifecycleEventObj = args[0];
        const handler = instrumentation._wrapExtMethods(lifecycleEventObj.method, lifecycleEventObj.type, pluginName);
        lifecycleEventObj.method = handler;
        return original.call(this, lifecycleEventObj);
      }
      return original.apply(this, args);
    };
  }

  /**
   * Patches the Server.route function. This function accepts either one or an array
   * of Hapi.ServerRoute objects and adds instrumentation on each route via a call to
   * the @function _wrapRouteHandler function.
   * @param {HapiServerRouteInputMethod} original - the original route function which adds
   * the route to the server
   * @param {string} [pluginName] - if present, represents the name of the plugin responsible
   * for adding this server route. Else, signifies that the route was added directly
   */
  private _getServerRoutePatch(original: HapiServerRouteInputMethod, pluginName?: string) {
    const instrumentation: HapiInstrumentation = this;
    return function route(this: Hapi.Server, route: HapiServerRouteInput): void {
      if (Array.isArray(route)) {
        for (let i = 0; i < route.length; i++) {
          const newRoute = instrumentation._wrapRouteHandler.call(instrumentation, route[i]!, pluginName);
          route[i] = newRoute;
        }
      } else {
        route = instrumentation._wrapRouteHandler.call(instrumentation, route, pluginName);
      }
      return original.apply(this, [route]);
    };
  }

  /**
   * Wraps newly registered plugins to add instrumentation to the plugin's clone of
   * the original server. Specifically, wraps the server.route and server.ext functions
   * via calls to @function _getServerRoutePatch and @function _getServerExtPatch
   * @param {Hapi.Plugin<T>} plugin - the new plugin which is being instrumented
   */
  private _wrapRegisterHandler<T>(plugin: Hapi.Plugin<T>): void {
    const instrumentation: HapiInstrumentation = this;
    const pluginName = getPluginName(plugin);
    const oldRegister = plugin.register;
    const self = this;
    const newRegisterHandler = function (this: typeof plugin, server: Hapi.Server, options: T) {
      self._wrap(server, 'route', original => {
        return instrumentation._getServerRoutePatch.bind(instrumentation)(original, pluginName);
      });

      // Casting as any is necessary here due to multiple overloads on the Hapi.ext
      // function, which requires supporting a variety of different parameters
      // as extension inputs
      self._wrap(server, 'ext', originalExtHandler => {
        return instrumentation._getServerExtPatch.bind(instrumentation)(originalExtHandler as any, pluginName);
      });
      return oldRegister.call(this, server, options);
    };
    plugin.register = newRegisterHandler;
  }

  /**
   * Wraps request extension methods to add instrumentation to each new extension handler.
   * Patches each individual extension in order to create the
   * span and propagate context. It does not create spans when there is no parent span.
   * @param {PatchableExtMethod | PatchableExtMethod[]} method - the request extension
   * handler which is being instrumented
   * @param {Hapi.ServerRequestExtType} extPoint - the point in the Hapi request lifecycle
   * which this extension targets
   * @param {string} [pluginName] - if present, represents the name of the plugin responsible
   * for adding this server route. Else, signifies that the route was added directly
   */
  private _wrapExtMethods<T extends PatchableExtMethod | PatchableExtMethod[]>(
    method: T,
    extPoint: Hapi.ServerRequestExtType,
    pluginName?: string,
  ): T {
    const instrumentation: HapiInstrumentation = this;
    if (method instanceof Array) {
      for (let i = 0; i < method.length; i++) {
        method[i] = instrumentation._wrapExtMethods(method[i]!, extPoint) as PatchableExtMethod;
      }
      return method;
    } else if (isPatchableExtMethod(method)) {
      if (method[handlerPatched] === true) return method;
      method[handlerPatched] = true;

      const newHandler: PatchableExtMethod = async function (this: any, ...params: Parameters<Hapi.Lifecycle.Method>) {
        if (api.trace.getSpan(api.context.active()) === undefined) {
          return await method.apply(this, params);
        }
        const metadata = getExtMetadata(extPoint, pluginName, method.name);
        const span = instrumentation.tracer.startSpan(metadata.name, {
          attributes: metadata.attributes,
        });
        try {
          return await api.context.with<Parameters<Hapi.Lifecycle.Method>, Hapi.Lifecycle.Method>(
            api.trace.setSpan(api.context.active(), span),
            method,
            undefined,
            ...params,
          );
        } catch (err: any) {
          span.recordException(err);
          span.setStatus({
            code: api.SpanStatusCode.ERROR,
            message: err.message,
          });
          throw err;
        } finally {
          span.end();
        }
      };
      return newHandler as T;
    }
    return method;
  }

  /**
   * Patches each individual route handler method in order to create the
   * span and propagate context. It does not create spans when there is no parent span.
   * @param {PatchableServerRoute} route - the route handler which is being instrumented
   * @param {string} [pluginName] - if present, represents the name of the plugin responsible
   * for adding this server route. Else, signifies that the route was added directly
   */
  private _wrapRouteHandler(route: PatchableServerRoute, pluginName?: string): PatchableServerRoute {
    const instrumentation: HapiInstrumentation = this;
    if (route[handlerPatched] === true) return route;
    route[handlerPatched] = true;

    const wrapHandler: (oldHandler: Hapi.Lifecycle.Method) => Hapi.Lifecycle.Method = oldHandler => {
      return async function (this: any, ...params: Parameters<Hapi.Lifecycle.Method>) {
        if (api.trace.getSpan(api.context.active()) === undefined) {
          return await oldHandler.call(this, ...params);
        }
        const rpcMetadata = getRPCMetadata(api.context.active());
        if (rpcMetadata?.type === RPCType.HTTP) {
          rpcMetadata.route = route.path;
        }
        const metadata = getRouteMetadata(route, instrumentation._semconvStability, pluginName);
        const span = instrumentation.tracer.startSpan(metadata.name, {
          attributes: metadata.attributes,
        });
        try {
          return await api.context.with(api.trace.setSpan(api.context.active(), span), () =>
            oldHandler.call(this, ...params),
          );
        } catch (err: any) {
          span.recordException(err);
          span.setStatus({
            code: api.SpanStatusCode.ERROR,
            message: err.message,
          });
          throw err;
        } finally {
          span.end();
        }
      };
    };

    if (typeof route.handler === 'function') {
      route.handler = wrapHandler(route.handler as Hapi.Lifecycle.Method);
    } else if (typeof route.options === 'function') {
      const oldOptions = route.options;
      route.options = function (server) {
        const options = oldOptions(server);
        if (typeof options.handler === 'function') {
          options.handler = wrapHandler(options.handler as Hapi.Lifecycle.Method);
        }
        return options;
      };
    } else if (typeof route.options?.handler === 'function') {
      route.options.handler = wrapHandler(route.options.handler as Hapi.Lifecycle.Method);
    }
    return route;
  }
}
