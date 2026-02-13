import type { DurableObjectStorage } from '@cloudflare/workers-types';
import {
  captureException,
  continueTrace,
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
import { buildSpanLinks, getStoredSpanContext, type StoredSpanContext,storeSpanContext } from './utils/traceLinks';

/** Extended DurableObjectState with originalStorage exposed by instrumentContext */
interface InstrumentedDurableObjectState extends DurableObjectState {
  originalStorage?: DurableObjectStorage;
}

export type MethodWrapperOptions = {
  spanName?: string;
  spanOp?: string;
  options: CloudflareOptions;
  context: ExecutionContext | DurableObjectState;
  /**
   * If true, starts a fresh trace instead of inheriting from a parent trace.
   * Useful for scheduled/independent invocations like alarms.
   * @default false
   */
  startNewTrace?: boolean;
  /**
   * If true, stores the current span context and links to the previous invocation's span.
   * Requires `startNewTrace` to be true. Uses Durable Object storage to persist the link.
   * @default false
   */
  linkPreviousTrace?: boolean;
};

type SpanLink = ReturnType<typeof buildSpanLinks>[number];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type UncheckedMethod = (...args: any[]) => any;
type OriginalMethod = UncheckedMethod;

/**
 * Wraps a method with Sentry error tracking and optional tracing.
 *
 * Supports starting new traces and linking to previous invocations via Durable Object storage.
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
      const { startNewTrace, linkPreviousTrace } = wrapperOptions;

      // For startNewTrace, always use withIsolationScope to ensure a fresh scope
      // Otherwise, use existing client's scope or isolation scope
      const currentClient = getClient();
      const sentryWithScope = startNewTrace ? withIsolationScope : currentClient ? withScope : withIsolationScope;

      const wrappedFunction = async (scope: Scope): Promise<unknown> => {
        // In certain situations, the passed context can become undefined.
        // For example, for Astro while prerendering pages at build time.
        // see: https://github.com/getsentry/sentry-javascript/issues/13217
        const context = wrapperOptions.context as InstrumentedDurableObjectState | undefined;

        const waitUntil = context?.waitUntil?.bind?.(context);
        // Use originalStorage (uninstrumented) for internal Sentry operations to avoid creating spans
        const originalStorage = context?.originalStorage;

        // For startNewTrace, always initialize a fresh client
        if (startNewTrace) {
          const client = init({ ...wrapperOptions.options, ctx: context as unknown as ExecutionContext | undefined });
          scope.setClient(client);
        } else {
          const currentClient = scope.getClient();
          if (!currentClient) {
            const client = init({ ...wrapperOptions.options, ctx: context as unknown as ExecutionContext | undefined });
            scope.setClient(client);
          }
        }

        // Build span links if linkPreviousTrace is enabled
        let links: SpanLink[] | undefined;
        let storedContext: StoredSpanContext | undefined;
        const methodName = wrapperOptions.spanName || 'unknown';

        if (linkPreviousTrace && originalStorage) {
          storedContext = await getStoredSpanContext(originalStorage, methodName);
          if (storedContext) {
            links = buildSpanLinks(storedContext);
          }
        }

        // Helper to store span context after execution
        const storeContextIfNeeded = async (): Promise<void> => {
          if (linkPreviousTrace && originalStorage) {
            await storeSpanContext(originalStorage, methodName);
          }
        };

        if (!wrapperOptions.spanName) {
          try {
            if (callback) {
              callback(...args);
            }
            const result = Reflect.apply(target, thisArg, args);

            if (isThenable(result)) {
              return result.then(
                async (res: unknown) => {
                  await storeContextIfNeeded();
                  waitUntil?.(flush(2000));
                  return res;
                },
                async (e: unknown) => {
                  captureException(e, {
                    mechanism: {
                      type: 'auto.faas.cloudflare.durable_object',
                      handled: false,
                    },
                  });
                  await storeContextIfNeeded();
                  waitUntil?.(flush(2000));
                  throw e;
                },
              );
            } else {
              await storeContextIfNeeded();
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
            await storeContextIfNeeded();
            waitUntil?.(flush(2000));
            throw e;
          }
        }

        const spanName = wrapperOptions.spanName || methodName;
        const attributes = {
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: wrapperOptions.spanOp || 'function',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.faas.cloudflare.durable_object',
        };

        // Use continueTrace for startNewTrace to ensure a fresh trace
        const executeSpan = (): unknown => {
          return startSpan({ name: spanName, attributes, links }, async span => {
            // TODO: Remove this once EAP can store span links. We currently only set this attribute so that we
            // can obtain the previous trace information from the EAP store. Long-term, EAP will handle
            // span links and then we should remove this again. Also throwing in a TODO(v11), to remind us
            // to check this at v11 time :)
            if (storedContext) {
              span.setAttribute('sentry.previous_trace', `${storedContext.traceId}-${storedContext.spanId}-1`);
            }

            try {
              const result = Reflect.apply(target, thisArg, args);

              if (isThenable(result)) {
                return result.then(
                  async (res: unknown) => {
                    await storeContextIfNeeded();
                    waitUntil?.(flush(2000));
                    return res;
                  },
                  async (e: unknown) => {
                    captureException(e, {
                      mechanism: {
                        type: 'auto.faas.cloudflare.durable_object',
                        handled: false,
                      },
                    });
                    await storeContextIfNeeded();
                    waitUntil?.(flush(2000));
                    throw e;
                  },
                );
              } else {
                await storeContextIfNeeded();
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
              await storeContextIfNeeded();
              waitUntil?.(flush(2000));
              throw e;
            }
          });
        };

        if (startNewTrace) {
          // Use continueTrace with empty headers to start a new trace
          return continueTrace({ sentryTrace: '', baggage: '' }, executeSpan);
        }

        return executeSpan();
      };

      return sentryWithScope(wrappedFunction);
    },
  });
}
