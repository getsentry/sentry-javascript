/**
 * Vendored and adapted from https://github.com/logaretm/otel-tracing-channel
 *
 * Creates a TracingChannel with proper OpenTelemetry context propagation
 * using Node.js diagnostic_channel's `bindStore` mechanism.
 */
import type { TracingChannel, TracingChannelSubscribers } from 'node:diagnostics_channel';
import { tracingChannel as nativeTracingChannel } from 'node:diagnostics_channel';
import type { Span } from '@opentelemetry/api';
import { context, trace } from '@opentelemetry/api';
import { logger } from '@sentry/core';
import type { SentryAsyncLocalStorageContextManager } from './asyncLocalStorageContextManager';
import type { AsyncLocalStorageLookup } from './contextManager';
import { DEBUG_BUILD } from './debug-build';

/**
 * Transform function that creates a span from the channel data.
 */
export type OtelTracingChannelTransform<TData = object> = (data: TData) => Span;

export type TracingChannelContextWithSpan<TContext extends object = object> = TContext & { _sentrySpan?: Span };

/**
 * A TracingChannel whose `subscribe` / `unsubscribe` accept partial subscriber
 * objects — you only need to provide handlers for the events you care about.
 */
export interface OtelTracingChannel<
  TData extends object = object,
  TDataWithSpan extends object = TracingChannelContextWithSpan<TData>,
> extends Omit<TracingChannel<TData, TDataWithSpan>, 'subscribe' | 'unsubscribe'> {
  subscribe(subscribers: Partial<TracingChannelSubscribers<TDataWithSpan>>): void;
  unsubscribe(subscribers: Partial<TracingChannelSubscribers<TDataWithSpan>>): void;
}

interface ContextApi {
  _getContextManager(): SentryAsyncLocalStorageContextManager;
}

/**
 * Creates a new tracing channel with proper OTel context propagation.
 *
 * When the channel's `tracePromise` / `traceSync` / `traceCallback` is called,
 * the `transformStart` function runs inside `bindStore` so that:
 *   1. A new span is created from the channel data.
 *   2. The span is set on the OTel context stored in AsyncLocalStorage.
 *   3. Downstream code (including Sentry's span processor) sees the correct parent.
 *
 * @param channelNameOrInstance - Either a channel name string or an existing TracingChannel instance.
 * @param transformStart - Function that creates an OpenTelemetry span from the channel data.
 * @returns The tracing channel with OTel context bound.
 */
export function tracingChannel<TData extends object = object>(
  channelNameOrInstance: string,
  transformStart: OtelTracingChannelTransform<TData>,
): OtelTracingChannel<TData, TracingChannelContextWithSpan<TData>> {
  const channel = nativeTracingChannel<TracingChannelContextWithSpan<TData>, TracingChannelContextWithSpan<TData>>(
    channelNameOrInstance,
  ) as unknown as OtelTracingChannel<TData, TracingChannelContextWithSpan<TData>>;

  let lookup: AsyncLocalStorageLookup | undefined;
  try {
    const contextManager = (context as unknown as ContextApi)._getContextManager();
    lookup = contextManager.getAsyncLocalStorageLookup();
  } catch {
    // getAsyncLocalStorageLookup may not exist if using a non-Sentry context manager
  }

  if (!lookup) {
    DEBUG_BUILD &&
      logger.warn(
        '[TracingChannel] Could not access OpenTelemetry AsyncLocalStorage, context propagation will not work.',
      );
    return channel;
  }

  const otelStorage = lookup.asyncLocalStorage;

  // Bind the start channel so that each trace invocation runs the transform
  // and stores the resulting context (with span) in AsyncLocalStorage.
  // @ts-expect-error bindStore types don't account for AsyncLocalStorage of a different generic type
  channel.start.bindStore(otelStorage, (data: TracingChannelContextWithSpan<TData>) => {
    const span = transformStart(data);

    // Store the span on data so downstream event handlers (asyncEnd, error, etc.) can access it.
    data._sentrySpan = span;

    // Return the context with the span set — this is what gets stored in AsyncLocalStorage.
    return trace.setSpan(context.active(), span);
  });

  return channel;
}
