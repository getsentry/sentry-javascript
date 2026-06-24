import * as diagnosticsChannel from 'node:diagnostics_channel';
import type { IntegrationFn, SpanAttributes } from '@sentry/core';
import {
  debug,
  defineIntegration,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  startInactiveSpan,
  startSpan,
} from '@sentry/core';
import { DEBUG_BUILD } from '../../debug-build';
import { CHANNELS } from '../../orchestrion/channels';
import { bindTracingChannelToSpan } from '../../tracing-channel';

// NOTE: this uses the same name as the OTel integration by design.
// When enabled, the OTel 'Nest' integration is omitted from the default set.
const INTEGRATION_NAME = 'Nest';

// Span op/origin/attribute values inlined to match the vendored
// `@opentelemetry/instrumentation-nestjs-core` output exactly (the
// `@sentry/nestjs` e2e suite asserts these). They are NOT imported from
// `@sentry/nestjs` because that package depends on this one, not vice versa.
// Orchestrion's whole point is to keep this surface free of OTel.
const NESTJS_COMPONENT = '@nestjs/core';
const ORIGIN_NESTJS = 'auto.http.otel.nestjs';
const ATTR_COMPONENT = 'component';
const ATTR_NESTJS_TYPE = 'nestjs.type';
const ATTR_NESTJS_VERSION = 'nestjs.version';
const ATTR_NESTJS_MODULE = 'nestjs.module';
const ATTR_NESTJS_CONTROLLER = 'nestjs.controller';
const ATTR_NESTJS_CALLBACK = 'nestjs.callback';
const ATTR_HTTP_ROUTE = 'http.route';
const ATTR_HTTP_METHOD = 'http.method';
const ATTR_HTTP_URL = 'http.url';
const TYPE_APP_CREATION = 'app_creation';
const TYPE_REQUEST_CONTEXT = 'request_context';
const TYPE_REQUEST_HANDLER = 'handler';

type AnyFn = (this: unknown, ...args: unknown[]) => unknown;

// Marks a function as already wrapped so repeated subscriptions (e.g. a second
// `setupOnce`) don't double-wrap a callback or returned handler.
const SENTRY_WRAPPED = Symbol.for('sentry.orchestrion.nestjs.wrapped');

function isWrapped(fn: AnyFn): boolean {
  return !!(fn as AnyFn & Record<symbol, unknown>)[SENTRY_WRAPPED];
}

function markWrapped(fn: AnyFn): void {
  (fn as AnyFn & Record<symbol, unknown>)[SENTRY_WRAPPED] = true;
}

/**
 * The shape orchestrion's `tracePromise` transform attaches to the
 * tracing-channel context for `NestFactoryStatic.prototype.create`.
 * `arguments[0]` is the root application module class.
 */
interface NestFactoryCreateData {
  arguments: unknown[];
  moduleVersion?: string;
  result?: unknown;
  error?: unknown;
}

/**
 * The shape orchestrion's `traceSync` (+ `mutableResult`) transform attaches to
 * the tracing-channel context for `RouterExecutionContext.prototype.create`.
 * `arguments[0]` is the controller instance, `arguments[1]` the route handler
 * callback, and `result` is the per-request handler `create` returns.
 */
interface RouterCreateData {
  arguments: unknown[];
  moduleVersion?: string;
  result?: unknown;
  error?: unknown;
}

/** Minimal request shape, across the express/fastify adapters. */
interface NestRequest {
  route?: { path?: string };
  routeOptions?: { url?: string };
  routerPath?: string;
  method?: string;
  originalUrl?: string;
  url?: string;
}

interface ReflectWithMetadata {
  getMetadataKeys?: (target: object) => unknown[];
  getMetadata?: (key: unknown, target: object) => unknown;
  defineMetadata?: (key: unknown, value: unknown, target: object) => void;
}

// Copy NestJS reflect-metadata from the original handler onto the wrapper so
// other decorators (param decorators, guards, `@EventPattern`, ...) that
// read it keep working. No-op when `reflect-metadata` isn't loaded. Mirrors
// vendored `@opentelemetry/instrumentation-nestjs-core` behaviour.
function copyReflectMetadata(from: object, to: object): void {
  const R = Reflect as unknown as ReflectWithMetadata;
  if (
    typeof R.getMetadataKeys !== 'function' ||
    typeof R.getMetadata !== 'function' ||
    typeof R.defineMetadata !== 'function'
  ) {
    return;
  }
  for (const key of R.getMetadataKeys(from)) {
    R.defineMetadata(key, R.getMetadata(key, from), to);
  }
}

// Wraps the route-handler callback (`create`'s `arguments[1]`) so each
// invocation opens the `handler.nestjs` span (REQUEST_HANDLER). Preserves the
// original `.name` and reflect-metadata so NestJS reflection is unaffected.
function wrapRouteHandler(callback: AnyFn, moduleVersion?: string): AnyFn {
  if (isWrapped(callback)) {
    return callback;
  }
  const spanName = callback.name || 'anonymous nest handler';
  const attributes: SpanAttributes = {
    [ATTR_COMPONENT]: NESTJS_COMPONENT,
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN_NESTJS,
    [ATTR_NESTJS_TYPE]: TYPE_REQUEST_HANDLER,
    [ATTR_NESTJS_CALLBACK]: callback.name,
    ...(moduleVersion ? { [ATTR_NESTJS_VERSION]: moduleVersion } : {}),
  };
  const wrapped = function (this: unknown, ...args: unknown[]): unknown {
    return startSpan({ name: spanName, op: `${TYPE_REQUEST_HANDLER}.nestjs`, attributes }, () =>
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

// Wraps the per-request handler `create` returns so each request opens the
// `request_context.nestjs` span (REQUEST_CONTEXT), carrying the controller /
// callback names captured at setup plus the per-request http.* attributes.
function wrapRequestContextHandler(
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
      [ATTR_COMPONENT]: NESTJS_COMPONENT,
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN_NESTJS,
      [ATTR_NESTJS_TYPE]: TYPE_REQUEST_CONTEXT,
      [ATTR_NESTJS_CONTROLLER]: instanceName,
      [ATTR_NESTJS_CALLBACK]: callbackName,
      ...(moduleVersion ? { [ATTR_NESTJS_VERSION]: moduleVersion } : {}),
      ...(httpRoute ? { [ATTR_HTTP_ROUTE]: httpRoute } : {}),
      ...(req.method ? { [ATTR_HTTP_METHOD]: req.method } : {}),
      ...(req.originalUrl || req.url ? { [ATTR_HTTP_URL]: req.originalUrl || req.url } : {}),
    };
    return startSpan({ name: spanName, op: `${TYPE_REQUEST_CONTEXT}.nestjs`, attributes }, () =>
      handler.apply(this, handlerArgs),
    );
  };
  markWrapped(wrapped);
  return wrapped;
}

const _nestjsChannelIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      DEBUG_BUILD && debug.log('[orchestrion:nestjs] subscribing to @nestjs/core channels');

      // App-creation span: `bindTracingChannelToSpan` opens the span on
      // `start`, makes it the active context for the bootstrap, and ends
      // it on `asyncEnd` (or `end` if `create` throws synchronously).
      // `captureError: false`. Failed bootstrap surfaces to the caller.
      // We just annotate the span.
      bindTracingChannelToSpan(
        diagnosticsChannel.tracingChannel<NestFactoryCreateData>(CHANNELS.NESTJS_APP_CREATION),
        data => {
          const moduleCls = data.arguments?.[0] as { name?: string } | undefined;
          return startInactiveSpan({
            name: 'Create Nest App',
            op: `${TYPE_APP_CREATION}.nestjs`,
            attributes: {
              [ATTR_COMPONENT]: NESTJS_COMPONENT,
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN_NESTJS,
              [ATTR_NESTJS_TYPE]: TYPE_APP_CREATION,
              ...(data.moduleVersion ? { [ATTR_NESTJS_VERSION]: data.moduleVersion } : {}),
              ...(moduleCls?.name ? { [ATTR_NESTJS_MODULE]: moduleCls.name } : {}),
            },
          });
        },
        { captureError: false },
      );

      // Request-context + request-handler spans.
      //
      // `RouterExecutionContext.create` runs once per route at setup
      // it receives `(instance, callback, ...)` and RETURNS the per-request
      // handler. We don't span `create` itself. Instead `start` wraps the
      // callback arg (-> one handler span per call) and, because the
      // config sets `mutableResult: true`, `end` replaces the returned
      // handler (-> one request_context span per request).
      //
      // Both wrappers open their span at invoke time, inside the request
      // context, so they parent correctly.
      const routerCh = diagnosticsChannel.tracingChannel<RouterCreateData>(CHANNELS.NESTJS_ROUTER_CONTEXT);
      const routerMeta = new WeakMap<object, { instanceName: string; callbackName: string; moduleVersion?: string }>();
      routerCh.subscribe({
        start(data) {
          const instance = data.arguments?.[0] as { constructor?: { name?: string } } | undefined;
          const callback = data.arguments?.[1];
          const instanceName = instance?.constructor?.name || 'UnnamedInstance';
          const callbackName = typeof callback === 'function' ? callback.name : '';
          routerMeta.set(data, { instanceName, callbackName, moduleVersion: data.moduleVersion });

          if (typeof callback === 'function') {
            data.arguments[1] = wrapRouteHandler(callback as AnyFn, data.moduleVersion);
          }
        },
        end(data) {
          const handler = data.result;
          const meta = routerMeta.get(data);
          if (typeof handler === 'function' && meta && !isWrapped(handler as AnyFn)) {
            data.result = wrapRequestContextHandler(
              handler as AnyFn,
              meta.instanceName,
              meta.callbackName,
              meta.moduleVersion,
            );
          }
          routerMeta.delete(data);
        },
        asyncStart() {
          // `create` is synchronous; no async events fire.
        },
        asyncEnd() {
          // `create` is synchronous; no async events fire.
        },
        error(data) {
          routerMeta.delete(data);
        },
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * EXPERIMENTAL orchestrion-driven NestJS integration.
 *
 * Subscribes to the diagnostics_channels the orchestrion code transform
 * injects into `@nestjs/core` (see `orchestrion/config.ts`). Requires the
 * orchestrion runtime hook or bundler plugin to be active.
 */
export const nestjsChannelIntegration = defineIntegration(_nestjsChannelIntegration);
