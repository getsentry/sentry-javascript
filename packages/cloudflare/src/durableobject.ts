/* eslint-disable @typescript-eslint/unbound-method */
import {
  captureException,
  flush,
  getClient,
  isThenable,
  type Scope,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  startSpan,
  withIsolationScope,
  withScope,
} from '@sentry/core';
import type { DurableObject } from 'cloudflare:workers';
import { setAsyncLocalStorageAsyncContextStrategy } from './async';
import type { CloudflareOptions } from './client';
import { isInstrumented, markAsInstrumented } from './instrument';
import { getFinalOptions } from './options';
import { wrapRequestHandler } from './request';
import { init } from './sdk';
import { copyExecutionContext } from './utils/copyExecutionContext';

type MethodWrapperOptions = {
  spanName?: string;
  spanOp?: string;
  options: CloudflareOptions;
  context: ExecutionContext | DurableObjectState;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UncheckedMethod = (...args: any[]) => any;
type OriginalMethod = UncheckedMethod;

function wrapMethodWithSentry<T extends OriginalMethod>(
  wrapperOptions: MethodWrapperOptions,
  handler: T,
  callback?: (...args: Parameters<T>) => void,
  noMark?: true,
): T {
  if (isInstrumented(handler)) {
    return handler;
  }

  if (!noMark) {
    markAsInstrumented(handler);
  }

  return new Proxy(handler, {
    apply(target, thisArg, args: Parameters<T>) {
      const currentClient = getClient();
      // if a client is already set, use withScope, otherwise use withIsolationScope
      const sentryWithScope = currentClient ? withScope : withIsolationScope;

      const wrappedFunction = (scope: Scope): unknown => {
        // In certain situations, the passed context can become undefined.
        // For example, for Astro while prerendering pages at build time.
        // see: https://github.com/getsentry/sentry-javascript/issues/13217
        const context = wrapperOptions.context as ExecutionContext | undefined;

        const waitUntil = context?.waitUntil?.bind?.(context);

        const currentClient = scope.getClient();
        if (!currentClient) {
          const client = init({ ...wrapperOptions.options, ctx: context });
          scope.setClient(client);
        }

        if (!wrapperOptions.spanName) {
          try {
            if (callback) {
              callback(...args);
            }
            const result = Reflect.apply(target, thisArg, args);

            if (isThenable(result)) {
              return result.then(
                (res: unknown) => {
                  waitUntil?.(flush(2000));
                  return res;
                },
                (e: unknown) => {
                  captureException(e, {
                    mechanism: {
                      type: 'auto.faas.cloudflare.durable_object',
                      handled: false,
                    },
                  });
                  waitUntil?.(flush(2000));
                  throw e;
                },
              );
            } else {
              waitUntil?.(flush(2000));
              return result;
            }
          } catch (e) {
            captureException(e, {
              mechanism: {
                type: 'auto.faas.cloudflare.durable_object',
                handled: false,
              },
            });
            waitUntil?.(flush(2000));
            throw e;
          }
        }

        const attributes = wrapperOptions.spanOp
          ? {
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: wrapperOptions.spanOp,
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.faas.cloudflare.durable_object',
            }
          : {};

        return startSpan({ name: wrapperOptions.spanName, attributes }, () => {
          try {
            const result = Reflect.apply(target, thisArg, args);

            if (isThenable(result)) {
              return result.then(
                (res: unknown) => {
                  waitUntil?.(flush(2000));
                  return res;
                },
                (e: unknown) => {
                  captureException(e, {
                    mechanism: {
                      type: 'auto.faas.cloudflare.durable_object',
                      handled: false,
                    },
                  });
                  waitUntil?.(flush(2000));
                  throw e;
                },
              );
            } else {
              waitUntil?.(flush(2000));
              return result;
            }
          } catch (e) {
            captureException(e, {
              mechanism: {
                type: 'auto.faas.cloudflare.durable_object',
                handled: false,
              },
            });
            waitUntil?.(flush(2000));
            throw e;
          }
        });
      };

      return sentryWithScope(wrappedFunction);
    },
  });
}

/**
 * Instruments a Durable Object class to capture errors and performance data.
 *
 * Instruments the following methods:
 * - fetch
 * - alarm
 * - webSocketMessage
 * - webSocketClose
 * - webSocketError
 *
 * as well as any other public RPC methods on the Durable Object instance.
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
      const context = copyExecutionContext(ctx);

      const options = getFinalOptions(optionsCallback(env), env);

      const obj = new target(context, env);

      // These are the methods that are available on a Durable Object
      // ref: https://developers.cloudflare.com/durable-objects/api/base/
      // obj.alarm
      // obj.fetch
      // obj.webSocketError
      // obj.webSocketClose
      // obj.webSocketMessage

      // Any other public methods on the Durable Object instance are RPC calls.

      if (obj.fetch && typeof obj.fetch === 'function' && !isInstrumented(obj.fetch)) {
        obj.fetch = new Proxy(obj.fetch, {
          apply(target, thisArg, args) {
            return wrapRequestHandler({ options, request: args[0], context }, () =>
              Reflect.apply(target, thisArg, args),
            );
          },
        });

        markAsInstrumented(obj.fetch);
      }

      if (obj.alarm && typeof obj.alarm === 'function') {
        obj.alarm = wrapMethodWithSentry({ options, context, spanName: 'alarm' }, obj.alarm);
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

      for (const method of Object.getOwnPropertyNames(obj)) {
        if (
          method === 'fetch' ||
          method === 'alarm' ||
          method === 'webSocketError' ||
          method === 'webSocketClose' ||
          method === 'webSocketMessage'
        ) {
          continue;
        }

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
        const value = (obj as any)[method] as unknown;
        if (typeof value === 'function') {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
          (obj as any)[method] = wrapMethodWithSentry(
            { options, context, spanName: method, spanOp: 'rpc' },
            value as UncheckedMethod,
          );
        }
      }

      // Store context and options on the instance for prototype methods to access
      Object.defineProperty(obj, '__SENTRY_CONTEXT__', {
        value: context,
        enumerable: false,
        writable: false,
        configurable: false,
      });

      Object.defineProperty(obj, '__SENTRY_OPTIONS__', {
        value: options,
        enumerable: false,
        writable: false,
        configurable: false,
      });

      if (options?.instrumentPrototypeMethods) {
        instrumentPrototype(target, options.instrumentPrototypeMethods);
      }

      return obj;
    },
  });
}

function instrumentPrototype<T extends NewableFunction>(target: T, methodsToInstrument: boolean | string[]): void {
  const proto = target.prototype;

  // Get all methods from the prototype chain
  const methodNames = new Set<string>();
  let current = proto;

  while (current && current !== Object.prototype) {
    Object.getOwnPropertyNames(current).forEach(name => {
      if (name !== 'constructor' && typeof (current as Record<string, unknown>)[name] === 'function') {
        methodNames.add(name);
      }
    });
    current = Object.getPrototypeOf(current);
  }

  // Create a set for efficient lookups when methodsToInstrument is an array
  const methodsToInstrumentSet = Array.isArray(methodsToInstrument) ? new Set(methodsToInstrument) : null;

  // Instrument each method on the prototype
  methodNames.forEach(methodName => {
    const originalMethod = (proto as Record<string, unknown>)[methodName];

    if (!originalMethod || isInstrumented(originalMethod)) {
      return;
    }

    // If methodsToInstrument is an array, only instrument methods in that set
    if (methodsToInstrumentSet && !methodsToInstrumentSet.has(methodName)) {
      return;
    }

    // Create a wrapper that gets context/options from the instance at runtime
    const wrappedMethod = function (this: unknown, ...args: unknown[]): unknown {
      const thisWithSentry = this as {
        __SENTRY_CONTEXT__: DurableObjectState;
        __SENTRY_OPTIONS__: CloudflareOptions;
      };
      const instanceContext = thisWithSentry.__SENTRY_CONTEXT__;
      const instanceOptions = thisWithSentry.__SENTRY_OPTIONS__;

      if (!instanceOptions) {
        // Fallback to original method if no Sentry data found
        return (originalMethod as UncheckedMethod).apply(this, args);
      }

      // Use the existing wrapper but with instance-specific context/options
      const wrapper = wrapMethodWithSentry(
        {
          options: instanceOptions,
          context: instanceContext,
          spanName: methodName,
          spanOp: 'rpc',
        },
        originalMethod as UncheckedMethod,
        undefined,
        true, // noMark = true since we'll mark the prototype method
      );

      return wrapper.apply(this, args);
    };

    markAsInstrumented(wrappedMethod);

    // Replace the prototype method
    Object.defineProperty(proto, methodName, {
      value: wrappedMethod,
      enumerable: false,
      writable: true,
      configurable: true,
    });
  });
}
