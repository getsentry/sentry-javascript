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
import type { CloudflareOptions } from './client';
import { isInstrumented, markAsInstrumented } from './instrument';
import { init } from './sdk';

type MethodWrapperOptions = {
  spanName?: string;
  spanOp?: string;
  options: CloudflareOptions;
  context: ExecutionContext | DurableObjectState;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type UncheckedMethod = (...args: any[]) => any;
type OriginalMethod = UncheckedMethod;

/**
 * Wraps a method with Sentry tracing.
 *
 * @param wrapperOptions - The options for the wrapper.
 * @param handler - The method to wrap.
 * @param callback - The callback to call.
 * @param noMark - Whether to mark the method as instrumented.
 * @returns The wrapped method.
 */
export function wrapMethodWithSentry<T extends OriginalMethod>(
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
