/* eslint-disable @typescript-eslint/unbound-method */
import {
  captureException,
  flush,
  getClient,
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

type MethodWrapperOptions = {
  spanName?: string;
  spanOp?: string;
  options: CloudflareOptions;
  context: ExecutionContext | DurableObjectState;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OriginalMethod = (...args: any[]) => any;

function wrapMethodWithSentry<T extends OriginalMethod>(
  wrapperOptions: MethodWrapperOptions,
  handler: T,
  callback?: (...args: Parameters<T>) => void,
): T {
  if (isInstrumented(handler)) {
    return handler;
  }

  markAsInstrumented(handler);

  return new Proxy(handler, {
    apply(target, thisArg, args: Parameters<T>) {
      const currentClient = getClient();
      // if a client is already set, use withScope, otherwise use withIsolationScope
      const sentryWithScope = currentClient ? withScope : withIsolationScope;
      return sentryWithScope(async scope => {
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
            return await Reflect.apply(target, thisArg, args);
          } catch (e) {
            captureException(e, {
              mechanism: {
                type: 'cloudflare_durableobject',
                handled: false,
              },
            });
            throw e;
          } finally {
            waitUntil?.(flush(2000));
          }
        }

        const attributes = wrapperOptions.spanOp
          ? {
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: wrapperOptions.spanOp,
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.faas.cloudflare_durableobjects',
            }
          : {};

        // Only create these spans if they have a parent span.
        return startSpan({ name: wrapperOptions.spanName, attributes, onlyIfParent: true }, async () => {
          try {
            return await Reflect.apply(target, thisArg, args);
          } catch (e) {
            captureException(e, {
              mechanism: {
                type: 'cloudflare_durableobject',
                handled: false,
              },
            });
            throw e;
          } finally {
            waitUntil?.(flush(2000));
          }
        });
      });
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
    construct(target, [context, env]) {
      setAsyncLocalStorageAsyncContextStrategy();

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
                type: 'cloudflare_durableobject_websocket',
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            value as (...args: any[]) => any,
          );
        }
      }
      const instrumentedPrototype = instrumentPrototype(target, options, context);
      Object.setPrototypeOf(obj, instrumentedPrototype);

      return obj;
    },
  });
}

function instrumentPrototype<T extends NewableFunction>(
  target: T,
  options: CloudflareOptions,
  context: MethodWrapperOptions['context'],
): typeof target.prototype {
  const sentryMethods = new Map<string | symbol, OriginalMethod>();
  let proto = target.prototype;
  const instrumentedPrototype = new Proxy(proto, {
    get(target, prop, receiver) {
      if (sentryMethods.has(prop)) {
        return sentryMethods.get(prop);
      }
      return Reflect.get(target, prop, receiver);
    },
  });
  while (proto && proto !== Object.prototype) {
    for (const method of Object.getOwnPropertyNames(proto)) {
      if (method === 'constructor' || sentryMethods.has(method)) {
        continue;
      }

      const value = Reflect.get(proto, method, proto);
      if (typeof value === 'function') {
        sentryMethods.set(
          method,
          wrapMethodWithSentry(
            {
              options,
              context,
              spanName: method,
              spanOp: 'rpc',
            },
            // <editor-fold desc="Disable __SENTRY_INSTRUMENTED__ for prototype methods">
            new Proxy(value, {
              set(target, p, newValue, receiver): boolean {
                if ('__SENTRY_INSTRUMENTED__' === p) {
                  return true;
                }
                return Reflect.set(target, p, newValue, receiver);
              },
            }),
            // </editor-fold>
          ),
        );
      }
    }
    proto = Object.getPrototypeOf(proto);
  }
  return instrumentedPrototype;
}
