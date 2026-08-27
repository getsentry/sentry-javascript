/*
 * Copyright (c) 2024-present The Fastify team <https://github.com/fastify/fastify#team>
 * SPDX-License-Identifier: MIT
 *
 * NOTICE from the Sentry authors:
 * - Based on: https://github.com/fastify/otel/tree/bae80d6caef4287e7f01ff3c8dc753243706ea86 (@fastify/otel@0.18.1)
 * - Streamlined to the Sentry SDK's needs: dropped the `InstrumentationBase` wrapper, the unused
 *   request/lifecycle hooks, `ignorePaths`/`minimatch` support and the OpenTelemetry tracer/context
 *   APIs in favor of the Sentry span API.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-this-alias */
/* eslint-disable max-lines */

import * as diagnosticsChannel from 'node:diagnostics_channel';
import {
  HTTP_REQUEST_METHOD,
  HTTP_RESPONSE_STATUS_CODE,
  HTTP_ROUTE,
  SENTRY_OP,
  URL_PATH,
} from '@sentry/conventions/attributes';
import { MIDDLEWARE } from '@sentry/conventions/op';
import type { Span } from '@sentry/core';
import {
  isObjectLike,
  getIsolationScope,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SPAN_STATUS_ERROR,
  startInactiveSpan,
  startSpan,
  withActiveSpan,
} from '@sentry/core';
import type { FastifyInstance } from './types';
import { setHttpServerSpanRouteAttribute } from '../../utils/setHttpServerSpanRouteAttribute';
import { handleFastifyError } from './errors';

const ORIGIN = 'auto.http.fastify';
const HOOK_OP = MIDDLEWARE;
// TODO(conventions): Replace with the `handler` span op constant once it is released in `@sentry/conventions`.
const REQUEST_HANDLER_OP = 'handler';

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
const ATTRIBUTE_HOOK_NAME = 'hook.name' as const;
const ATTRIBUTE_FASTIFY_TYPE = 'fastify.type' as const;
const ATTRIBUTE_HOOK_CALLBACK_NAME = 'hook.callback.name' as const;

const HOOK_TYPE_ROUTE = 'route-hook' as const;
const HOOK_TYPE_INSTANCE = 'hook' as const;
const HOOK_TYPE_HANDLER = 'request-handler' as const;
const ANONYMOUS_FUNCTION_NAME = 'anonymous';

const kRequestSpan = Symbol('sentry fastify request span');
const kAddHookOriginal = Symbol('sentry fastify addHook original');
const kSetNotFoundOriginal = Symbol('sentry fastify setNotFoundHandler original');

type AnyFn = (...args: any[]) => any;

/**
 * Read the matched route URL off a request. Fastify >=4 exposes it on `request.routeOptions.url`,
 * while v3 only has the (since-removed-in-v5) `request.routerPath`.
 */
function getRequestRouteUrl(request: any): string | undefined {
  return request.routeOptions?.url ?? request.routerPath;
}

/**
 * Detect whether one of a wrapped handler's arguments is the Fastify request. We can't rely on a
 * single property since the route metadata moved from `routerPath` (v3) to `routeOptions` (>=4),
 * so we accept either shape.
 */
function isFastifyRequest(arg: any): boolean {
  return isObjectLike(arg) && !!arg.method && !!arg.url && (!!arg.routeOptions || 'routerPath' in arg);
}

/**
 * Wire up the request/hook/handler spans and error handling on a Fastify instance.
 *
 * This runs synchronously from the `fastify.initialization` diagnostics channel, which fires while
 * `Fastify()` is still constructing the instance, before any user code runs. Doing it synchronously
 * (rather than via `instance.register()`, which defers the work until the boot phase) is what lets us
 * patch `addHook`/`setNotFoundHandler` in time: `addHook` runs immediately, so hooks a user adds
 * synchronously before `listen()`/`ready()` would otherwise slip through un-instrumented.
 */
function instrumentFastifyInstance(instance: FastifyInstance): void {
  // oxlint-disable-next-line typescript/unbound-method
  instance.decorate(kAddHookOriginal, instance.addHook);
  instance.decorate(kSetNotFoundOriginal, instance.setNotFoundHandler);
  instance.decorateRequest('opentelemetry', function opentelemetry(this: any) {
    return { span: this[kRequestSpan] as Span | null };
  });
  instance.decorateRequest(kRequestSpan, null);

  instance.addHook('onRoute', onRoute);
  instance.addHook('onRequest', onRequest);
  instance.addHook('onResponse', onResponse);
  // Must be an async hook: a sync (callback-style) `onError` hook would have to invoke Fastify's
  // `done` callback
  instance.addHook('onError', async (request, reply, error) => {
    handleFastifyError(request, reply, error);
  });

  // Patch last, so the hooks we add above go through the original (un-wrapped) `addHook`.
  instance.addHook = addHookPatched;
  instance.setNotFoundHandler = setNotFoundHandlerPatched;
}

function onRoute(this: any, routeOptions: any): void {
  for (const hook of FASTIFY_HOOKS) {
    const handlerLike = routeOptions[hook];

    if (typeof handlerLike === 'function') {
      routeOptions[hook] = handlerWrapper(
        handlerLike,
        hook,
        routeHookAttributes(this.pluginName, hook, handlerLike, routeOptions.url),
      );
    } else if (Array.isArray(handlerLike)) {
      routeOptions[hook] = handlerLike.map((handler: AnyFn) =>
        handlerWrapper(handler, hook, routeHookAttributes(this.pluginName, hook, handler, routeOptions.url)),
      );
    }
  }

  routeOptions.onSend = appendRouteHook(routeOptions.onSend, finalizeResponseSpanHook);
  routeOptions.onError = appendRouteHook(routeOptions.onError, recordErrorInSpanHook);

  routeOptions.handler = handlerWrapper(routeOptions.handler, 'handler', {
    [ATTRIBUTE_HOOK_NAME]: `${this.pluginName} - route-handler`,
    [ATTRIBUTE_FASTIFY_TYPE]: HOOK_TYPE_HANDLER,
    [HTTP_ROUTE]: routeOptions.url,
    [ATTRIBUTE_HOOK_CALLBACK_NAME]:
      routeOptions.handler.name.length > 0 ? routeOptions.handler.name : ANONYMOUS_FUNCTION_NAME,
  });
}

function routeHookAttributes(pluginName: string, hook: string, handler: AnyFn, url: string): Record<string, string> {
  return {
    [ATTRIBUTE_HOOK_NAME]: `${pluginName} - route -> ${hook}`,
    [ATTRIBUTE_FASTIFY_TYPE]: HOOK_TYPE_ROUTE,
    [HTTP_ROUTE]: url,
    [ATTRIBUTE_HOOK_CALLBACK_NAME]: handler.name?.length > 0 ? handler.name : ANONYMOUS_FUNCTION_NAME,
  };
}

function appendRouteHook(existing: AnyFn | AnyFn[] | undefined, hook: AnyFn): AnyFn | AnyFn[] {
  if (existing == null) {
    return hook;
  }
  return Array.isArray(existing) ? [...existing, hook] : [existing, hook];
}

function onRequest(this: any, request: any, _reply: any, hookDone: () => void): void {
  const routeName = getRequestRouteUrl(request);
  const method = request.method || 'GET';

  getIsolationScope().setTransactionName(`${method} ${routeName}`);

  const attributes: Record<string, string> = {
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
    [SENTRY_OP]: REQUEST_HANDLER_OP,
    [HTTP_REQUEST_METHOD]: request.method,
    [URL_PATH]: request.url,
  };

  const route = getRequestRouteUrl(request);
  if (route != null) {
    attributes[HTTP_ROUTE] = route;

    setHttpServerSpanRouteAttribute(route);
  }

  const requestSpan = startInactiveSpan({
    name: route != null ? `${request.method} ${route}` : 'request',
    attributes,
  });
  request[kRequestSpan] = requestSpan;

  // Set the request span as the active span for the remainder of the request lifecycle, so that
  // downstream hooks/handlers as well as errors captured via the error diagnostics channel are
  // parented to it (otherwise they would attach to the root `http.server` span instead).
  withActiveSpan(requestSpan, () => {
    hookDone();
  });
}

function onResponse(request: any, reply: any, hookDone: () => void): void {
  const span = request[kRequestSpan] as Span | null;

  if (span != null) {
    span.setAttributes({ [HTTP_RESPONSE_STATUS_CODE]: reply.statusCode });
    span.end();
  }

  request[kRequestSpan] = null;

  hookDone();
}

function finalizeResponseSpanHook(
  request: any,
  reply: any,
  payload: any,
  hookDone: (err: null, payload: any) => void,
): void {
  const span = request[kRequestSpan] as Span | null;

  if (span != null) {
    if (reply.statusCode >= 500) {
      span.setStatus({ code: SPAN_STATUS_ERROR });
    }
    span.setAttributes({ [HTTP_RESPONSE_STATUS_CODE]: reply.statusCode });
    span.end();
  }

  request[kRequestSpan] = null;

  hookDone(null, payload);
}

function recordErrorInSpanHook(request: any, _reply: any, error: any, hookDone: () => void): void {
  const span = request[kRequestSpan] as Span | null;

  if (span != null) {
    span.setStatus({ code: SPAN_STATUS_ERROR, message: error.message });
  }

  hookDone();
}

function addHookPatched(this: any, name: string, hook: AnyFn): FastifyInstance {
  const addHookOriginal = this[kAddHookOriginal];

  if (FASTIFY_HOOKS.includes(name)) {
    return addHookOriginal.call(
      this,
      name,
      handlerWrapper(hook, name, {
        [ATTRIBUTE_HOOK_NAME]: `${this.pluginName} - ${name}`,
        [ATTRIBUTE_FASTIFY_TYPE]: HOOK_TYPE_INSTANCE,
        [ATTRIBUTE_HOOK_CALLBACK_NAME]: hook.name?.length > 0 ? hook.name : ANONYMOUS_FUNCTION_NAME,
      }),
    );
  }

  return addHookOriginal.call(this, name, hook);
}

function setNotFoundHandlerPatched(this: any, hooks: any, handler?: any): void {
  const setNotFoundHandlerOriginal = this[kSetNotFoundOriginal];

  if (typeof hooks === 'function') {
    setNotFoundHandlerOriginal.call(
      this,
      handlerWrapper(hooks, 'notFoundHandler', {
        [ATTRIBUTE_HOOK_NAME]: `${this.pluginName} - not-found-handler`,
        [ATTRIBUTE_FASTIFY_TYPE]: HOOK_TYPE_INSTANCE,
        [ATTRIBUTE_HOOK_CALLBACK_NAME]: hooks.name?.length > 0 ? hooks.name : ANONYMOUS_FUNCTION_NAME,
      }),
    );
    return;
  }

  if (hooks.preValidation != null) {
    hooks.preValidation = handlerWrapper(hooks.preValidation, 'notFoundHandler - preValidation', {
      [ATTRIBUTE_HOOK_NAME]: `${this.pluginName} - not-found-handler - preValidation`,
      [ATTRIBUTE_FASTIFY_TYPE]: HOOK_TYPE_INSTANCE,
      [ATTRIBUTE_HOOK_CALLBACK_NAME]:
        hooks.preValidation.name?.length > 0 ? hooks.preValidation.name : ANONYMOUS_FUNCTION_NAME,
    });
  }

  if (hooks.preHandler != null) {
    hooks.preHandler = handlerWrapper(hooks.preHandler, 'notFoundHandler - preHandler', {
      [ATTRIBUTE_HOOK_NAME]: `${this.pluginName} - not-found-handler - preHandler`,
      [ATTRIBUTE_FASTIFY_TYPE]: HOOK_TYPE_INSTANCE,
      [ATTRIBUTE_HOOK_CALLBACK_NAME]:
        hooks.preHandler.name?.length > 0 ? hooks.preHandler.name : ANONYMOUS_FUNCTION_NAME,
    });
  }

  // Fastify allows `setNotFoundHandler(opts)` without a handler, falling back to its built-in 404
  // handler. Forward the (already-wrapped) hooks unchanged so that fallback still applies.
  if (handler == null) {
    setNotFoundHandlerOriginal.call(this, hooks);
    return;
  }

  setNotFoundHandlerOriginal.call(
    this,
    hooks,
    handlerWrapper(handler, 'notFoundHandler', {
      [ATTRIBUTE_HOOK_NAME]: `${this.pluginName} - not-found-handler`,
      [ATTRIBUTE_FASTIFY_TYPE]: HOOK_TYPE_INSTANCE,
      [ATTRIBUTE_HOOK_CALLBACK_NAME]: handler.name?.length > 0 ? handler.name : ANONYMOUS_FUNCTION_NAME,
    }),
  );
}

function getRequestFromArgs(args: any[]): any | null {
  for (const arg of args) {
    if (isFastifyRequest(arg)) {
      return arg;
    }
  }
  return null;
}

function handlerWrapper(handler: AnyFn, hookName: string, spanAttributes: Record<string, string> = {}): AnyFn {
  return function handlerWrapped(this: any, ...args: any[]) {
    const request = getRequestFromArgs(args);

    if (!request) {
      return handler.call(this, ...args);
    }

    const parentSpan = (request[kRequestSpan] as Span | null) ?? undefined;
    const handlerName = handler.name?.length > 0 ? handler.name : (this.pluginName ?? ANONYMOUS_FUNCTION_NAME);

    const hookType = spanAttributes[ATTRIBUTE_FASTIFY_TYPE];
    const op =
      hookType === HOOK_TYPE_INSTANCE ? HOOK_OP : hookType === HOOK_TYPE_HANDLER ? REQUEST_HANDLER_OP : undefined;

    const attributeHookName = spanAttributes[ATTRIBUTE_HOOK_NAME];

    const name = op && typeof attributeHookName === 'string' ? attributeHookName : `${hookName} - ${handlerName}`;

    return startSpan(
      {
        name,
        attributes: {
          ...spanAttributes,
          [SENTRY_OP]: op,
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
        },
        parentSpan,
      },
      () => handler.call(this, ...args),
    );
  };
}

let _isInstrumented = false;

/**
 * Set up the Fastify (>= 3.21.0 < 6) instrumentation by subscribing to the `fastify.initialization`
 * diagnostics channel and synchronously instrumenting every Fastify instance as it is created.
 */
export function instrumentFastify(): void {
  if (_isInstrumented) {
    return;
  }
  _isInstrumented = true;

  diagnosticsChannel.subscribe('fastify.initialization', message => {
    const fastifyInstance = (message as { fastify?: FastifyInstance }).fastify;

    if (fastifyInstance) {
      instrumentFastifyInstance(fastifyInstance);
    }
  });
}
