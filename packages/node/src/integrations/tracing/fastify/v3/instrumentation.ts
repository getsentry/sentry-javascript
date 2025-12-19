// Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/407f61591ba69a39a6908264379d4d98a48dbec4/plugins/node/opentelemetry-instrumentation-fastify/src/instrumentation.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-this-alias */
/* eslint-disable jsdoc/require-jsdoc */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

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
 */

import { type Attributes, context, SpanStatusCode, trace } from '@opentelemetry/api';
import { getRPCMetadata, RPCType } from '@opentelemetry/core';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  safeExecuteInTheMiddle,
} from '@opentelemetry/instrumentation';
import { SEMATTRS_HTTP_ROUTE } from '@opentelemetry/semantic-conventions';
import type { Span } from '@sentry/core';
import {
  getClient,
  getIsolationScope,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  spanToJSON,
} from '@sentry/core';
import type {
  FastifyErrorCodes,
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  HandlerOriginal,
  HookHandlerDoneFunction,
} from '../types';
import { AttributeNames, FastifyNames, FastifyTypes } from './enums/AttributeNames';
import type { PluginFastifyReply } from './internal-types';
import type { FastifyInstrumentationConfig } from './types';
import { endSpan, safeExecuteInTheMiddleMaybePromise, startSpan } from './utils';
/** @knipignore */

const PACKAGE_VERSION = '0.1.0';

const PACKAGE_NAME = '@sentry/instrumentation-fastify-v3';
const ANONYMOUS_NAME = 'anonymous';

// The instrumentation creates a span for invocations of lifecycle hook handlers
// that take `(request, reply, ...[, done])` arguments. Currently this is all
// lifecycle hooks except `onRequestAbort`.
// https://fastify.dev/docs/latest/Reference/Hooks
const hooksNamesToWrap = new Set([
  'onTimeout',
  'onRequest',
  'preParsing',
  'preValidation',
  'preSerialization',
  'preHandler',
  'onSend',
  'onResponse',
  'onError',
]);

/**
 * Fastify instrumentation for OpenTelemetry
 */
export class FastifyInstrumentationV3 extends InstrumentationBase<FastifyInstrumentationConfig> {
  public constructor(config: FastifyInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);
  }

  public init(): InstrumentationNodeModuleDefinition[] {
    return [
      new InstrumentationNodeModuleDefinition('fastify', ['>=3.0.0 <4'], moduleExports => {
        return this._patchConstructor(moduleExports);
      }),
    ];
  }

  private _hookOnRequest() {
    const instrumentation = this;

    return function onRequest(request: FastifyRequest, reply: FastifyReply, done: HookHandlerDoneFunction) {
      if (!instrumentation.isEnabled()) {
        return done();
      }
      instrumentation._wrap(reply, 'send', instrumentation._patchSend());

      const anyRequest = request as any;

      const rpcMetadata = getRPCMetadata(context.active());
      const routeName = anyRequest.routeOptions
        ? anyRequest.routeOptions.url // since fastify@4.10.0
        : request.routerPath;
      if (routeName && rpcMetadata?.type === RPCType.HTTP) {
        rpcMetadata.route = routeName;
      }

      const method = request.method || 'GET';

      getIsolationScope().setTransactionName(`${method} ${routeName}`);
      done();
    };
  }

  private _wrapHandler(
    pluginName: string,
    hookName: string,
    original: HandlerOriginal,
    syncFunctionWithDone: boolean,
  ): () => Promise<unknown> {
    const instrumentation = this;
    this._diag.debug('Patching fastify route.handler function');

    return function (this: any, ...args: unknown[]): Promise<unknown> {
      if (!instrumentation.isEnabled()) {
        return original.apply(this, args);
      }

      const name = original.name || pluginName || ANONYMOUS_NAME;
      const spanName = `${FastifyNames.MIDDLEWARE} - ${name}`;

      const reply = args[1] as PluginFastifyReply;

      const span = startSpan(reply, instrumentation.tracer, spanName, {
        [AttributeNames.FASTIFY_TYPE]: FastifyTypes.MIDDLEWARE,
        [AttributeNames.PLUGIN_NAME]: pluginName,
        [AttributeNames.HOOK_NAME]: hookName,
      });

      const origDone = syncFunctionWithDone && (args[args.length - 1] as HookHandlerDoneFunction);
      if (origDone) {
        args[args.length - 1] = function (...doneArgs: Parameters<HookHandlerDoneFunction>) {
          endSpan(reply);
          origDone.apply(this, doneArgs);
        };
      }

      return context.with(trace.setSpan(context.active(), span), () => {
        return safeExecuteInTheMiddleMaybePromise(
          () => {
            return original.apply(this, args);
          },
          err => {
            if (err instanceof Error) {
              span.setStatus({
                code: SpanStatusCode.ERROR,
                message: err.message,
              });
              span.recordException(err);
            }
            // async hooks should end the span as soon as the promise is resolved
            if (!syncFunctionWithDone) {
              endSpan(reply);
            }
          },
        );
      });
    };
  }

  private _wrapAddHook(): (original: FastifyInstance['addHook']) => () => FastifyInstance {
    const instrumentation = this;
    this._diag.debug('Patching fastify server.addHook function');

    // biome-ignore lint/complexity/useArrowFunction: <explanation>
    return function (original: FastifyInstance['addHook']): () => FastifyInstance {
      return function wrappedAddHook(this: any, ...args: any) {
        const name = args[0] as string;
        const handler = args[1] as HandlerOriginal;
        const pluginName = this.pluginName;
        if (!hooksNamesToWrap.has(name)) {
          return original.apply(this, args);
        }

        const syncFunctionWithDone =
          typeof args[args.length - 1] === 'function' && handler.constructor.name !== 'AsyncFunction';

        return original.apply(this, [
          name,
          instrumentation._wrapHandler(pluginName, name, handler, syncFunctionWithDone),
        ] as never);
      };
    };
  }

  private _patchConstructor(moduleExports: {
    fastify: () => FastifyInstance;
    errorCodes: FastifyErrorCodes | undefined;
  }): () => FastifyInstance {
    const instrumentation = this;

    function fastify(this: FastifyInstance, ...args: any) {
      const app: FastifyInstance = moduleExports.fastify.apply(this, args);
      app.addHook('onRequest', instrumentation._hookOnRequest());
      app.addHook('preHandler', instrumentation._hookPreHandler());

      instrumentClient();

      instrumentation._wrap(app, 'addHook', instrumentation._wrapAddHook());

      return app;
    }

    if (moduleExports.errorCodes !== undefined) {
      fastify.errorCodes = moduleExports.errorCodes;
    }
    fastify.fastify = fastify;
    fastify.default = fastify;
    return fastify;
  }

  private _patchSend() {
    const instrumentation = this;
    this._diag.debug('Patching fastify reply.send function');

    return function patchSend(original: () => FastifyReply): () => FastifyReply {
      return function send(this: FastifyReply, ...args: any) {
        const maybeError: any = args[0];

        if (!instrumentation.isEnabled()) {
          return original.apply(this, args);
        }

        return safeExecuteInTheMiddle<FastifyReply>(
          () => {
            return original.apply(this, args);
          },
          err => {
            if (!err && maybeError instanceof Error) {
              // eslint-disable-next-line no-param-reassign
              err = maybeError;
            }
            endSpan(this, err);
          },
        );
      };
    };
  }

  private _hookPreHandler() {
    const instrumentation = this;
    this._diag.debug('Patching fastify preHandler function');

    return function preHandler(this: any, request: FastifyRequest, reply: FastifyReply, done: HookHandlerDoneFunction) {
      if (!instrumentation.isEnabled()) {
        return done();
      }
      const anyRequest = request as any;

      const handler = anyRequest.routeOptions?.handler || anyRequest.context?.handler;
      const handlerName = handler?.name.startsWith('bound ') ? handler.name.substring(6) : handler?.name;
      const spanName = `${FastifyNames.REQUEST_HANDLER} - ${handlerName || this.pluginName || ANONYMOUS_NAME}`;

      const spanAttributes: Attributes = {
        [AttributeNames.PLUGIN_NAME]: this.pluginName,
        [AttributeNames.FASTIFY_TYPE]: FastifyTypes.REQUEST_HANDLER,
        // eslint-disable-next-line deprecation/deprecation
        [SEMATTRS_HTTP_ROUTE]: anyRequest.routeOptions
          ? anyRequest.routeOptions.url // since fastify@4.10.0
          : request.routerPath,
      };
      if (handlerName) {
        spanAttributes[AttributeNames.FASTIFY_NAME] = handlerName;
      }
      const span = startSpan(reply, instrumentation.tracer, spanName, spanAttributes);

      addFastifyV3SpanAttributes(span);

      const { requestHook } = instrumentation.getConfig();
      if (requestHook) {
        safeExecuteInTheMiddle(
          () => requestHook(span, { request }),
          e => {
            if (e) {
              instrumentation._diag.error('request hook failed', e);
            }
          },
          true,
        );
      }

      return context.with(trace.setSpan(context.active(), span), () => {
        done();
      });
    };
  }
}

function instrumentClient(): void {
  const client = getClient();
  if (client) {
    client.on('spanStart', (span: Span) => {
      addFastifyV3SpanAttributes(span);
    });
  }
}

function addFastifyV3SpanAttributes(span: Span): void {
  const attributes = spanToJSON(span).data;

  // this is one of: middleware, request_handler
  const type = attributes['fastify.type'];

  // If this is already set, or we have no fastify span, no need to process again...
  if (attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP] || !type) {
    return;
  }

  span.setAttributes({
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.otel.fastify',
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: `${type}.fastify`,
  });

  // Also update the name, we don't need to "middleware - " prefix
  const name = attributes['fastify.name'] || attributes['plugin.name'] || attributes['hook.name'];
  if (typeof name === 'string') {
    // Try removing `fastify -> ` and `@fastify/otel -> ` prefixes
    // This is a bit of a hack, and not always working for all spans
    // But it's the best we can do without a proper API
    const updatedName = name.replace(/^fastify -> /, '').replace(/^@fastify\/otel -> /, '');

    span.updateName(updatedName);
  }
}
