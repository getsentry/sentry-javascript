/*
 * MIT License
 *
 * Copyright (c) 2024-present The Fastify team <https://github.com/fastify/fastify#team>
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/fastify/otel/tree/bae80d6caef4287e7f01ff3c8dc753243706ea86
 * - Upstream version: @fastify/otel@0.18.1
 * - Converted from JavaScript to TypeScript with minimal type annotations
 * - Removed `ignorePaths` / `minimatch` support (not used by the Sentry integration)
 */
/* eslint-disable */

import * as dc from 'node:diagnostics_channel';
import { context, trace, SpanStatusCode, propagation, diag, type Span } from '@opentelemetry/api';
import {
  ATTR_HTTP_ROUTE,
  ATTR_HTTP_RESPONSE_STATUS_CODE,
  ATTR_HTTP_REQUEST_METHOD,
  ATTR_URL_PATH,
} from '@opentelemetry/semantic-conventions';
import { InstrumentationBase, type InstrumentationConfig } from '@opentelemetry/instrumentation';
import { SDK_VERSION } from '@sentry/core';
import { setHttpServerSpanRouteAttribute } from '../../../../utils/setHttpServerSpanRouteAttribute';

const PACKAGE_VERSION = SDK_VERSION;
const PACKAGE_NAME = '@sentry/instrumentation-fastify';

const SUPPORTED_VERSIONS = '>=4.0.0 <6';
const FASTIFY_HOOKS = [
  'onRequest',
  'preParsing',
  'preValidation',
  'preHandler',
  'preSerialization',
  'onSend',
  'onResponse',
  'onError',
];
const ATTRIBUTE_NAMES = {
  HOOK_NAME: 'hook.name',
  FASTIFY_TYPE: 'fastify.type',
  HOOK_CALLBACK_NAME: 'hook.callback.name',
  ROOT: 'fastify.root',
};
const HOOK_TYPES = {
  ROUTE: 'route-hook',
  INSTANCE: 'hook',
  HANDLER: 'request-handler',
};
const ANONYMOUS_FUNCTION_NAME = 'anonymous';

const kInstrumentation = Symbol('fastify otel instance');
const kRequestSpan = Symbol('fastify otel request spans');
const kRequestContext = Symbol('fastify otel request context');
const kAddHookOriginal = Symbol('fastify otel addhook original');
const kSetNotFoundOriginal = Symbol('fastify otel setnotfound original');
const kRecordExceptions = Symbol('fastify otel record exceptions');

export interface FastifyOtelInstrumentationOpts extends InstrumentationConfig {
  registerOnInitialization?: boolean;
  requestHook?: (span: Span, request: any) => void;
  lifecycleHook?: (span: Span, info: { hookName: string; request: any; handler?: string }) => void;
  recordExceptions?: boolean;
}

export class FastifyOtelInstrumentation extends InstrumentationBase<FastifyOtelInstrumentationOpts> {
  _otelLogger: any = null;
  _requestHook: ((span: Span, request: any) => void) | null = null;
  _lifecycleHook: ((span: Span, info: any) => void) | null = null;
  _handleInitialization: ((message: any) => void) | undefined = undefined;

  [kRecordExceptions]: boolean = true;

  constructor(config: FastifyOtelInstrumentationOpts = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);
    this._otelLogger = diag.createComponentLogger({ namespace: PACKAGE_NAME });
    this[kRecordExceptions] = true;

    if (config?.recordExceptions != null) {
      if (typeof config.recordExceptions !== 'boolean') {
        throw new TypeError('recordExceptions must be a boolean');
      }

      this[kRecordExceptions] = config.recordExceptions;
    }
    if (typeof config?.requestHook === 'function') {
      this._requestHook = config.requestHook;
    }
    if (typeof config?.lifecycleHook === 'function') {
      this._lifecycleHook = config.lifecycleHook;
    }
  }

  enable(): any {
    if (this._handleInitialization === undefined && this.getConfig().registerOnInitialization) {
      this._handleInitialization = (message: any) => {
        this.plugin()(message.fastify, undefined, () => {});
        const emptyPlugin: any = (_: any, __: any, done: () => void) => {
          done();
        };
        emptyPlugin[Symbol.for('skip-override')] = true;
        emptyPlugin[Symbol.for('fastify.display-name')] = PACKAGE_NAME;
        message.fastify.register(emptyPlugin);
      };
      dc.subscribe('fastify.initialization', this._handleInitialization);
    }
    return super.enable();
  }

  disable(): any {
    if (this._handleInitialization) {
      dc.unsubscribe('fastify.initialization', this._handleInitialization);
      this._handleInitialization = undefined;
    }
    return super.disable();
  }

  init() {
    return [];
  }

  plugin(): any {
    const instrumentation = this;

    const pluginAny = FastifyInstrumentationPlugin as any;
    pluginAny[Symbol.for('skip-override')] = true;
    pluginAny[Symbol.for('fastify.display-name')] = PACKAGE_NAME;
    pluginAny[Symbol.for('plugin-meta')] = {
      fastify: SUPPORTED_VERSIONS,
      name: PACKAGE_NAME,
    };

    return FastifyInstrumentationPlugin;

    function FastifyInstrumentationPlugin(instance: any, _opts: any, done: () => void) {
      instance.decorate(kInstrumentation, instrumentation);
      instance.decorate(kAddHookOriginal, instance.addHook);
      instance.decorate(kSetNotFoundOriginal, instance.setNotFoundHandler);
      instance.decorateRequest('opentelemetry', function opentelemetry(this: any) {
        const ctx = this[kRequestContext];
        const span = this[kRequestSpan];

        return {
          enabled: this.routeOptions.config?.otel !== false,
          span,
          tracer: instrumentation.tracer,
          context: ctx,
          inject: (carrier: any, setter?: any) => {
            return propagation.inject(ctx, carrier, setter);
          },
          extract: (carrier: any, getter?: any) => {
            return propagation.extract(ctx, carrier, getter);
          },
        };
      });
      instance.decorateRequest(kRequestSpan, null);
      instance.decorateRequest(kRequestContext, null);

      instance.addHook('onRoute', function otelWireRoute(this: any, routeOptions: any) {
        if (routeOptions.config?.otel === false) {
          instrumentation._otelLogger.debug(
            `Ignoring route instrumentation ${routeOptions.method} ${routeOptions.url} because it is disabled`,
          );

          return;
        }

        for (const hook of FASTIFY_HOOKS) {
          if (routeOptions[hook] != null) {
            const handlerLike = routeOptions[hook];

            if (typeof handlerLike === 'function') {
              routeOptions[hook] = handlerWrapper(handlerLike, hook, {
                [ATTRIBUTE_NAMES.HOOK_NAME]: `${this.pluginName} - route -> ${hook}`,
                [ATTRIBUTE_NAMES.FASTIFY_TYPE]: HOOK_TYPES.ROUTE,
                [ATTR_HTTP_ROUTE]: routeOptions.url,
                [ATTRIBUTE_NAMES.HOOK_CALLBACK_NAME]:
                  handlerLike.name?.length > 0 ? handlerLike.name : ANONYMOUS_FUNCTION_NAME,
              });
            } else if (Array.isArray(handlerLike)) {
              const wrappedHandlers: any[] = [];

              for (const handler of handlerLike) {
                wrappedHandlers.push(
                  handlerWrapper(handler, hook, {
                    [ATTRIBUTE_NAMES.HOOK_NAME]: `${this.pluginName} - route -> ${hook}`,
                    [ATTRIBUTE_NAMES.FASTIFY_TYPE]: HOOK_TYPES.ROUTE,
                    [ATTR_HTTP_ROUTE]: routeOptions.url,
                    [ATTRIBUTE_NAMES.HOOK_CALLBACK_NAME]:
                      handler.name?.length > 0 ? handler.name : ANONYMOUS_FUNCTION_NAME,
                  }),
                );
              }

              routeOptions[hook] = wrappedHandlers;
            }
          }
        }

        if (routeOptions.onSend != null) {
          routeOptions.onSend = Array.isArray(routeOptions.onSend)
            ? [...routeOptions.onSend, finalizeResponseSpanHook]
            : [routeOptions.onSend, finalizeResponseSpanHook];
        } else {
          routeOptions.onSend = finalizeResponseSpanHook;
        }

        if (routeOptions.onError != null) {
          routeOptions.onError = Array.isArray(routeOptions.onError)
            ? [...routeOptions.onError, recordErrorInSpanHook]
            : [routeOptions.onError, recordErrorInSpanHook];
        } else {
          routeOptions.onError = recordErrorInSpanHook;
        }

        routeOptions.handler = handlerWrapper(routeOptions.handler, 'handler', {
          [ATTRIBUTE_NAMES.HOOK_NAME]: `${this.pluginName} - route-handler`,
          [ATTRIBUTE_NAMES.FASTIFY_TYPE]: HOOK_TYPES.HANDLER,
          [ATTR_HTTP_ROUTE]: routeOptions.url,
          [ATTRIBUTE_NAMES.HOOK_CALLBACK_NAME]:
            routeOptions.handler.name.length > 0 ? routeOptions.handler.name : ANONYMOUS_FUNCTION_NAME,
        });
      });

      instance.addHook(
        'onRequest',
        function startRequestSpanHook(this: any, request: any, _reply: any, hookDone: () => void) {
          if (this[kInstrumentation].isEnabled() === false || request.routeOptions.config?.otel === false) {
            return hookDone();
          }

          let ctx = context.active();

          if (trace.getSpan(ctx) == null) {
            ctx = propagation.extract(ctx, request.headers);
          }

          if (request.routeOptions.url != null) {
            setHttpServerSpanRouteAttribute(request.routeOptions.url);
          }

          const attributes: Record<string, string> = {
            [ATTRIBUTE_NAMES.ROOT]: PACKAGE_NAME,
            [ATTR_HTTP_REQUEST_METHOD]: request.method,
            [ATTR_URL_PATH]: request.url,
          };

          if (request.routeOptions.url != null) {
            attributes[ATTR_HTTP_ROUTE] = request.routeOptions.url;
          }

          const span = this[kInstrumentation].tracer.startSpan('request', { attributes }, ctx);

          try {
            this[kInstrumentation]._requestHook?.(span, request);
          } catch (err) {
            this[kInstrumentation]._otelLogger.error({ err }, 'requestHook threw');
          }

          request[kRequestContext] = trace.setSpan(ctx, span);
          request[kRequestSpan] = span;

          context.with(request[kRequestContext], () => {
            hookDone();
          });
        },
      );

      instance.addHook('onResponse', function finalizeNotFoundSpanHook(request: any, reply: any, hookDone: () => void) {
        const span = request[kRequestSpan];

        if (span != null) {
          span.setAttributes({
            [ATTR_HTTP_RESPONSE_STATUS_CODE]: reply.statusCode,
          });
          span.end();
        }

        request[kRequestSpan] = null;

        hookDone();
      });

      instance.addHook = addHookPatched;
      instance.setNotFoundHandler = setNotFoundHandlerPatched;

      done();

      function finalizeResponseSpanHook(
        request: any,
        reply: any,
        payload: any,
        hookDone: (err: null, payload: any) => void,
      ) {
        const span = request[kRequestSpan];

        if (span != null) {
          if (reply.statusCode >= 500) {
            span.setStatus({ code: SpanStatusCode.ERROR });
          }

          span.setAttributes({
            [ATTR_HTTP_RESPONSE_STATUS_CODE]: reply.statusCode,
          });
          span.end();
        }

        request[kRequestSpan] = null;

        hookDone(null, payload);
      }

      function recordErrorInSpanHook(request: any, _reply: any, error: any, hookDone: () => void) {
        const span = request[kRequestSpan];

        if (span != null) {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error.message,
          });
          if (instrumentation[kRecordExceptions] !== false) {
            span.recordException(error);
          }
        }

        hookDone();
      }

      function addHookPatched(this: any, name: string, hook: (...args: any[]) => any) {
        const addHookOriginal = this[kAddHookOriginal];

        if (FASTIFY_HOOKS.includes(name)) {
          return addHookOriginal.call(
            this,
            name,
            handlerWrapper(hook, name, {
              [ATTRIBUTE_NAMES.HOOK_NAME]: `${this.pluginName} - ${name}`,
              [ATTRIBUTE_NAMES.FASTIFY_TYPE]: HOOK_TYPES.INSTANCE,
              [ATTRIBUTE_NAMES.HOOK_CALLBACK_NAME]: hook.name?.length > 0 ? hook.name : ANONYMOUS_FUNCTION_NAME,
            }),
          );
        } else {
          return addHookOriginal.call(this, name, hook);
        }
      }

      function setNotFoundHandlerPatched(this: any, hooks: any, handler?: any) {
        const setNotFoundHandlerOriginal = this[kSetNotFoundOriginal];
        if (typeof hooks === 'function') {
          handler = handlerWrapper(hooks, 'notFoundHandler', {
            [ATTRIBUTE_NAMES.HOOK_NAME]: `${this.pluginName} - not-found-handler`,
            [ATTRIBUTE_NAMES.FASTIFY_TYPE]: HOOK_TYPES.INSTANCE,
            [ATTRIBUTE_NAMES.HOOK_CALLBACK_NAME]: hooks.name?.length > 0 ? hooks.name : ANONYMOUS_FUNCTION_NAME,
          });
          setNotFoundHandlerOriginal.call(this, handler);
        } else {
          if (hooks.preValidation != null) {
            hooks.preValidation = handlerWrapper(hooks.preValidation, 'notFoundHandler - preValidation', {
              [ATTRIBUTE_NAMES.HOOK_NAME]: `${this.pluginName} - not-found-handler - preValidation`,
              [ATTRIBUTE_NAMES.FASTIFY_TYPE]: HOOK_TYPES.INSTANCE,
              [ATTRIBUTE_NAMES.HOOK_CALLBACK_NAME]:
                hooks.preValidation.name?.length > 0 ? hooks.preValidation.name : ANONYMOUS_FUNCTION_NAME,
            });
          }

          if (hooks.preHandler != null) {
            hooks.preHandler = handlerWrapper(hooks.preHandler, 'notFoundHandler - preHandler', {
              [ATTRIBUTE_NAMES.HOOK_NAME]: `${this.pluginName} - not-found-handler - preHandler`,
              [ATTRIBUTE_NAMES.FASTIFY_TYPE]: HOOK_TYPES.INSTANCE,
              [ATTRIBUTE_NAMES.HOOK_CALLBACK_NAME]:
                hooks.preHandler.name?.length > 0 ? hooks.preHandler.name : ANONYMOUS_FUNCTION_NAME,
            });
          }

          handler = handlerWrapper(handler, 'notFoundHandler', {
            [ATTRIBUTE_NAMES.HOOK_NAME]: `${this.pluginName} - not-found-handler`,
            [ATTRIBUTE_NAMES.FASTIFY_TYPE]: HOOK_TYPES.INSTANCE,
            [ATTRIBUTE_NAMES.HOOK_CALLBACK_NAME]: handler.name?.length > 0 ? handler.name : ANONYMOUS_FUNCTION_NAME,
          });
          setNotFoundHandlerOriginal.call(this, hooks, handler);
        }
      }

      function getRequestFromArgs(args: any[]) {
        for (const arg of args) {
          if (arg?.routeOptions && arg.url && arg.method) {
            return arg;
          }
        }
        return null;
      }

      function handlerWrapper(
        handler: (...args: any[]) => any,
        hookName: string,
        spanAttributes: Record<string, string> = {},
      ) {
        return function handlerWrapped(this: any, ...args: any[]) {
          const instrumentation: FastifyOtelInstrumentation = this[kInstrumentation];

          const request = getRequestFromArgs(args);
          if (request === null) {
            instrumentation._otelLogger.debug(
              `Ignoring route instrumentation because ${hookName} was called without a Fastify request argument`,
            );
            return handler.call(this, ...args);
          }

          if (instrumentation.isEnabled() === false || request.routeOptions.config?.otel === false) {
            instrumentation._otelLogger.debug(
              `Ignoring route instrumentation ${request.routeOptions.method} ${request.routeOptions.url} because it is disabled`,
            );
            return handler.call(this, ...args);
          }

          const ctx = request[kRequestContext] ?? context.active();
          const handlerName = handler.name?.length > 0 ? handler.name : (this.pluginName ?? ANONYMOUS_FUNCTION_NAME);

          const span = instrumentation.tracer.startSpan(
            `${hookName} - ${handlerName}`,
            {
              attributes: spanAttributes,
            },
            ctx,
          );

          if (instrumentation._lifecycleHook != null) {
            try {
              instrumentation._lifecycleHook(span, {
                hookName,
                request,
                handler: handlerName,
              });
            } catch (err) {
              instrumentation._otelLogger.error({ err }, 'Execution of lifecycleHook failed');
            }
          }

          return context.with(
            trace.setSpan(ctx, span),
            function (this: any) {
              try {
                const res = handler.call(this, ...args);

                if (typeof res?.then === 'function') {
                  return res.then(
                    (result: any) => {
                      span.end();
                      return result;
                    },
                    (error: any) => {
                      span.setStatus({
                        code: SpanStatusCode.ERROR,
                        message: error.message,
                      });
                      if (instrumentation[kRecordExceptions] !== false) {
                        span.recordException(error);
                      }
                      span.end();
                      return Promise.reject(error);
                    },
                  );
                }

                span.end();
                return res;
              } catch (error: any) {
                span.setStatus({
                  code: SpanStatusCode.ERROR,
                  message: error.message,
                });
                if (instrumentation[kRecordExceptions] !== false) {
                  span.recordException(error);
                }
                span.end();
                throw error;
              }
            },
            this,
          );
        };
      }
    }
  }
}
