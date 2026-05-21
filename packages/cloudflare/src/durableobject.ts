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
import { extractRpcMeta } from './utils/rpcMeta';
import { getEffectiveRpcPropagation } from './utils/rpcOptions';
import { type UncheckedMethod, wrapMethodWithSentry } from './wrapMethodWithSentry';

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

      // When using the deprecated `instrumentPrototypeMethods` option, always create spans.
      // When using the new `enableRpcTracePropagation`, only create spans when RPC metadata is present.
      const alwaysTrace = options.instrumentPrototypeMethods !== undefined;

      // Return a Proxy that binds all methods to the original object and creates spans
      // for RPC calls that have Sentry trace context propagated.
      // Binding is required because frameworks may use private fields (babel WeakMap pattern),
      // which fail if `this` is the Proxy instead of the original object.
      const methodCache = new Map<string, UncheckedMethod>();

      return new Proxy(obj, {
        get(proxyTarget, prop, receiver) {
          const value = Reflect.get(proxyTarget, prop, receiver);

          if (typeof prop !== 'string' || typeof value !== 'function') {
            return value;
          }

          const cached = methodCache.get(prop);

          if (cached) {
            return cached;
          }

          const boundMethod = (value as UncheckedMethod).bind(proxyTarget);

          if (
            prop in Object.prototype ||
            Object.prototype.hasOwnProperty.call(proxyTarget, prop) ||
            (allowSet && !allowSet.has(prop))
          ) {
            methodCache.set(prop, boundMethod);

            return boundMethod;
          }

          // Pre-create the traced version
          const tracedMethod = wrapMethodWithSentry(
            { options, context, spanName: prop, spanOp: 'rpc' },
            boundMethod,
            undefined,
            true,
          );

          // For deprecated `instrumentPrototypeMethods`, always trace.
          // For new `enableRpcTracePropagation`, only trace when RPC metadata is present.
          if (alwaysTrace) {
            methodCache.set(prop, tracedMethod);

            return tracedMethod;
          }

          // Wrapper that checks for Sentry RPC metadata at call time
          const wrappedMethod = ((...args: unknown[]) => {
            const { rpcMeta } = extractRpcMeta(args);

            // If Sentry RPC metadata is present, use the traced version (creates span)
            // Otherwise, call the bound method directly (no span)
            return rpcMeta ? tracedMethod(...args) : boundMethod(...args);
          }) as UncheckedMethod;

          methodCache.set(prop, wrappedMethod);

          return wrappedMethod;
        },
      });
    },
  });
}
