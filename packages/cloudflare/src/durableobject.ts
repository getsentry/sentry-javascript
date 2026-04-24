/* eslint-disable @typescript-eslint/unbound-method */
import { captureException } from '@sentry/core';
import type { DurableObject } from 'cloudflare:workers';
import { setAsyncLocalStorageAsyncContextStrategy } from './async';
import type { CloudflareOptions } from './client';
import { ensureInstrumented } from './instrument';
import { instrumentEnv } from './instrumentations/worker/instrumentEnv';
import { getFinalOptions } from './options';
import { wrapRequestHandler } from './request';
import { instrumentContext } from './utils/instrumentContext';
import { getEffectiveRpcPropagation } from './utils/rpcOptions';
import { type UncheckedMethod, wrapMethodWithSentry } from './wrapMethodWithSentry';

const BUILT_IN_DO_METHODS = new Set([
  'constructor',
  'fetch',
  'alarm',
  'webSocketError',
  'webSocketClose',
  'webSocketMessage',
]);

/**
 * Instruments a Durable Object class to capture errors and performance data.
 *
 * Instruments the following methods by default:
 * - fetch
 * - alarm
 * - webSocketMessage
 * - webSocketClose
 * - webSocketError
 *
 * To instrument RPC methods (prototype methods), enable the `enableRpcTracePropagation` option.
 *
 * @param optionsCallback Function that returns the options for the SDK initialization.
 * @param DurableObjectClass The Durable Object class to instrument.
 * @returns The instrumented Durable Object class.
 *
 * @example
 * ```ts
 * class MyDurableObjectBase extends DurableObject {
 *   constructor(ctx: DurableObjectState, env: Env) {
 *     super(ctx, env);
 *   }
 * }
 *
 * export const MyDurableObject = instrumentDurableObjectWithSentry(
 *   env => ({
 *     dsn: env.SENTRY_DSN,
 *     tracesSampleRate: 1.0,
 *   }),
 *   MyDurableObjectBase,
 * );
 * ```
 */
export function instrumentDurableObjectWithSentry<
  E,
  T extends DurableObject<E>,
  C extends new (state: DurableObjectState, env: E) => T,
>(optionsCallback: (env: E) => CloudflareOptions, DurableObjectClass: C): C {
  return new Proxy(DurableObjectClass, {
    construct(target, [ctx, env]) {
      setAsyncLocalStorageAsyncContextStrategy();
      const context = instrumentContext(ctx);
      const options = getFinalOptions(optionsCallback(env), env);
      const instrumentedEnv = instrumentEnv(env, options);

      const obj = new target(context, instrumentedEnv);

      // These are the methods that are available on a Durable Object
      // ref: https://developers.cloudflare.com/durable-objects/api/base/
      // obj.alarm
      // obj.fetch
      // obj.webSocketError
      // obj.webSocketClose
      // obj.webSocketMessage

      // Any other public methods on the Durable Object instance are RPC calls.

      if (obj.fetch && typeof obj.fetch === 'function') {
        obj.fetch = ensureInstrumented(
          obj.fetch,
          original =>
            new Proxy(original, {
              apply(target, thisArg, args) {
                return wrapRequestHandler({ options, request: args[0], context }, () => {
                  return Reflect.apply(target, thisArg, args);
                });
              },
            }),
        );
      }

      if (obj.alarm && typeof obj.alarm === 'function') {
        // Alarms are independent invocations, so we start a new trace and link to the previous alarm
        obj.alarm = wrapMethodWithSentry(
          { options, context, spanName: 'alarm', spanOp: 'function', startNewTrace: true },
          obj.alarm,
        );
      }

      if (obj.webSocketMessage && typeof obj.webSocketMessage === 'function') {
        obj.webSocketMessage = wrapMethodWithSentry(
          { options, context, spanName: 'webSocketMessage' },
          obj.webSocketMessage,
        );
      }

      if (obj.webSocketClose && typeof obj.webSocketClose === 'function') {
        obj.webSocketClose = wrapMethodWithSentry({ options, context, spanName: 'webSocketClose' }, obj.webSocketClose);
      }

      if (obj.webSocketError && typeof obj.webSocketError === 'function') {
        obj.webSocketError = wrapMethodWithSentry(
          { options, context, spanName: 'webSocketError' },
          obj.webSocketError,
          (_, error) =>
            captureException(error, {
              mechanism: {
                type: 'auto.faas.cloudflare.durable_object_websocket',
                handled: false,
              },
            }),
        );
      }

      // Get effective RPC propagation setting (handles deprecation of instrumentPrototypeMethods)
      const rpcPropagation = getEffectiveRpcPropagation(options);

      // Skip RPC instrumentation if not enabled
      if (!rpcPropagation) {
        return obj;
      }

      // If `instrumentPrototypeMethods` was passed as an array (deprecated),
      // only the listed method names should be instrumented.
      const instrumentPrototypeMethods = Array.isArray(options.instrumentPrototypeMethods)
        ? options.instrumentPrototypeMethods
        : undefined;
      const allowSet = instrumentPrototypeMethods ? new Set(instrumentPrototypeMethods) : null;

      // Return a Proxy that lazily wraps prototype methods on access.
      // This avoids iterating the prototype chain at construction time —
      // we only check if a property is an RPC method when it's accessed.
      const rpcMethodCache = new Map<string, UncheckedMethod>();

      return new Proxy(obj, {
        get(proxyTarget, prop, receiver) {
          if (typeof prop !== 'string' || BUILT_IN_DO_METHODS.has(prop)) {
            return Reflect.get(proxyTarget, prop, receiver);
          }

          const cached = rpcMethodCache.get(prop);

          if (cached) {
            return cached;
          }

          const value = Reflect.get(proxyTarget, prop, receiver);

          if (
            typeof value !== 'function' ||
            Object.prototype.hasOwnProperty.call(proxyTarget, prop) ||
            (allowSet && !allowSet.has(prop)) ||
            // Exclude inherited Object.prototype methods (toString, valueOf, etc.)
            // These are not RPC methods and should not create spans
            prop in Object.prototype
          ) {
            return value;
          }

          const wrapped = wrapMethodWithSentry(
            { options, context, spanName: prop, spanOp: 'rpc' },
            value as UncheckedMethod,
            undefined,
            true,
          );

          rpcMethodCache.set(prop, wrapped);

          return wrapped;
        },
      });
    },
  });
}
