import type { DurableObjectState, DurableObjectStorage } from '@cloudflare/workers-types';
import { TraceFlags } from '@opentelemetry/api';
import {
  captureException,
  continueTrace,
  flush,
  getActiveSpan,
  isThenable,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  startSpan,
  withIsolationScope,
} from '@sentry/core';
import type { CloudflareOptions } from './client';
import { isInstrumented, markAsInstrumented } from './instrument';
import { init } from './sdk';

/** Storage key for the span context that links consecutive alarms */
const SENTRY_ALARM_TRACE_LINK_KEY = '__SENTRY_ALARM_TRACE_LINK__';

/** Extended DurableObjectState with originalStorage exposed by instrumentContext */
interface InstrumentedDurableObjectState extends DurableObjectState {
  originalStorage?: DurableObjectStorage;
}

/** Stored span context for creating span links */
interface StoredSpanContext {
  traceId: string;
  spanId: string;
}

/** Span link structure for connecting traces */
interface AlarmSpanLink {
  context: {
    traceId: string;
    spanId: string;
    traceFlags: number;
  };
  attributes?: Record<string, string>;
}

type AlarmWrapperOptions = {
  options: CloudflareOptions;
  context: ExecutionContext | DurableObjectState;
};

/**
 * Stores the current alarm's span context in Durable Object storage.
 * This should be called at the end of an alarm handler to enable span linking
 * for the next alarm execution.
 *
 * Uses the original uninstrumented storage to avoid creating spans for internal operations.
 */
async function storeAlarmSpanContext(originalStorage: DurableObjectStorage): Promise<void> {
  const activeSpan = getActiveSpan();
  if (activeSpan) {
    const spanContext = activeSpan.spanContext();
    const storedContext: StoredSpanContext = {
      traceId: spanContext.traceId,
      spanId: spanContext.spanId,
    };
    await originalStorage.put(SENTRY_ALARM_TRACE_LINK_KEY, storedContext);
  }
}

/**
 * Wraps an alarm handler to ensure each alarm invocation gets its own trace.
 * This is different from wrapMethodWithSentry because alarms are independent
 * invocations triggered by Cloudflare's scheduler, not as part of an existing request.
 *
 * If a previous alarm stored its span context, a span link will be created
 * connecting the new alarm trace to the previous alarm's trace.
 *
 * After execution, the current alarm's span context is stored so the next
 * alarm can link back to it, creating a chain of linked alarm traces.
 */
export function wrapAlarmWithSentry(
  wrapperOptions: AlarmWrapperOptions,
  handler: () => void | Promise<void>,
): () => Promise<void> {
  if (isInstrumented(handler)) {
    return handler as () => Promise<void>;
  }

  markAsInstrumented(handler);

  return new Proxy(handler, {
    apply(target, thisArg, args) {
      // Always use withIsolationScope to ensure each alarm gets a fresh scope
      return withIsolationScope(async isolationScope => {
        const context = wrapperOptions.context as InstrumentedDurableObjectState | undefined;
        const waitUntil = context?.waitUntil?.bind?.(context);
        // Use originalStorage (uninstrumented) for internal Sentry operations to avoid creating spans
        const originalStorage = context?.originalStorage;

        // Always initialize a fresh client for each alarm
        // Cast context to ExecutionContext for init() compatibility
        const client = init({ ...wrapperOptions.options, ctx: context as unknown as ExecutionContext | undefined });
        isolationScope.setClient(client);

        let links: AlarmSpanLink[] | undefined;
        let storedContext: StoredSpanContext | undefined;

        // Read and consume the stored span context from the previous alarm
        if (originalStorage) {
          try {
            storedContext = await originalStorage.get<StoredSpanContext>(SENTRY_ALARM_TRACE_LINK_KEY);
          } catch {
            // Ignore errors reading stored context
          }
        }

        if (storedContext) {
          links = [
            {
              context: {
                traceId: storedContext.traceId,
                spanId: storedContext.spanId,
                traceFlags: TraceFlags.SAMPLED,
              },
              attributes: {
                'sentry.link.type': 'previous_trace',
              },
            },
          ];
        }

        const attributes = {
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'function',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.faas.cloudflare.durable_object',
        };

        // Use continueTrace with empty headers to start a new trace
        return continueTrace({ sentryTrace: '', baggage: '' }, () => {
          return startSpan({ name: 'alarm', attributes, links }, async span => {
            if (storedContext) {
              // TODO: Remove this once EAP can store span links. We currently only set this attribute so that we
              // can obtain the previous trace information from the EAP store. Long-term, EAP will handle
              // span links and then we should remove this again. Also throwing in a TODO(v11), to remind us
              // to check this at v11 time :)
              span.setAttribute(
                'sentry.previous_trace',
                `${storedContext.traceId}-${storedContext.spanId}-1`,
              );
            }
            try {
              const result = Reflect.apply(target, thisArg, args);

              if (isThenable(result)) {
                return result.then(
                  async (res: unknown) => {
                    // Store the current alarm's span context for the next alarm
                    if (originalStorage) {
                      await storeAlarmSpanContext(originalStorage);
                    }
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
                    // Still store span context on error so chain continues
                    if (originalStorage) {
                      await storeAlarmSpanContext(originalStorage);
                    }
                    waitUntil?.(flush(2000));
                    throw e;
                  },
                );
              } else {
                // Store the current alarm's span context for the next alarm
                if (originalStorage) {
                  await storeAlarmSpanContext(originalStorage);
                }
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
              // Still store span context on error so chain continues
              if (originalStorage) {
                await storeAlarmSpanContext(originalStorage);
              }
              waitUntil?.(flush(2000));
              throw e;
            }
          });
        });
      });
    },
  }) as () => Promise<void>;
}
