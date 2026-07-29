import { HTTP_METHOD, HTTP_ROUTE, URL_FULL } from '@sentry/conventions/attributes';
import type { SpanAttributes } from '@sentry/core';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, startSpan } from '@sentry/core';
import type { AnyFn } from './helpers';
import { copyReflectMetadata, httpOrigin, isWrapped, markWrapped } from './helpers';
import { AttributeNames, NestType } from './enums';

/**
 * Shared span-emitting logic for the NestJS route/controller spans
 * (app-creation / request-context / request-handler). Used by the orchestrion
 * channel subscriber.
 */

const NESTJS_COMPONENT = '@nestjs/core';

/** Minimal request shape, across the express/fastify adapters. */
interface NestRequest {
  route?: { path?: string };
  routeOptions?: { url?: string };
  routerPath?: string;
  method?: string;
  originalUrl?: string;
  url?: string;
}

/** Span options for the `Create Nest App` (app_creation) span. */
export function getAppCreationSpanOptions(
  moduleVersion?: string,
  moduleName?: string,
): { name: string; op: string; attributes: SpanAttributes } {
  return {
    name: 'Create Nest App',
    op: `${NestType.APP_CREATION}.nestjs`,
    attributes: {
      component: NESTJS_COMPONENT,
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: httpOrigin(),
      [AttributeNames.TYPE]: NestType.APP_CREATION,
      [AttributeNames.VERSION]: moduleVersion || undefined,
      [AttributeNames.MODULE]: moduleName || undefined,
    },
  };
}

/**
 * Wrap the route-handler callback so each invocation opens the `handler.nestjs`
 * span (REQUEST_HANDLER). Preserve the original `.name` and reflect-metadata so
 * NestJS reflection is unaffected.
 */
export function wrapRouteHandler(callback: AnyFn, moduleVersion?: string): AnyFn {
  if (isWrapped(callback)) {
    return callback;
  }
  const spanName = callback.name || 'anonymous nest handler';
  const attributes: SpanAttributes = {
    component: NESTJS_COMPONENT,
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: httpOrigin(),
    [AttributeNames.TYPE]: NestType.REQUEST_HANDLER,
    [AttributeNames.CALLBACK]: callback.name,
    [AttributeNames.VERSION]: moduleVersion || undefined,
  };
  const wrapped = function (this: unknown, ...args: unknown[]): unknown {
    return startSpan({ name: spanName, op: `${NestType.REQUEST_HANDLER}.nestjs`, attributes }, () =>
      callback.apply(this, args),
    );
  };
  if (callback.name) {
    Object.defineProperty(wrapped, 'name', { value: callback.name });
  }
  copyReflectMetadata(callback, wrapped);
  markWrapped(wrapped);
  return wrapped;
}

/**
 * Wrap the per-request handler that `RouterExecutionContext.create` returns so
 * each request opens the `request_context.nestjs` span (REQUEST_CONTEXT),
 * carrying controller/callback names plus the per-request http.* attributes.
 */
export function wrapRequestContextHandler(
  handler: AnyFn,
  instanceName: string,
  callbackName: string,
  moduleVersion?: string,
): AnyFn {
  const spanName = callbackName ? `${instanceName}.${callbackName}` : instanceName;
  const wrapped = function (this: unknown, ...handlerArgs: unknown[]): unknown {
    const req = (handlerArgs[0] || {}) as NestRequest;
    const httpRoute = req.route?.path || req.routeOptions?.url || req.routerPath;
    const attributes: SpanAttributes = {
      component: NESTJS_COMPONENT,
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: httpOrigin(),
      [AttributeNames.TYPE]: NestType.REQUEST_CONTEXT,
      [AttributeNames.CONTROLLER]: instanceName,
      [AttributeNames.CALLBACK]: callbackName,
      [AttributeNames.VERSION]: moduleVersion || undefined,
      [HTTP_ROUTE]: httpRoute || undefined,
      // oxlint-disable-next-line typescript/no-deprecated
      [HTTP_METHOD]: req.method || undefined,
      [URL_FULL]: req.originalUrl || req.url || undefined,
    };
    return startSpan({ name: spanName, op: `${NestType.REQUEST_CONTEXT}.nestjs`, attributes }, () =>
      handler.apply(this, handlerArgs),
    );
  };
  markWrapped(wrapped);
  return wrapped;
}
