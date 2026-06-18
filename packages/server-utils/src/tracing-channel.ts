import type { TracingChannel, TracingChannelSubscribers } from 'node:diagnostics_channel';
import type { AsyncLocalStorage } from 'node:async_hooks';
import type { Span } from '@sentry/core';
import { _INTERNAL_getTracingChannelBinding, debug, captureException, SPAN_STATUS_ERROR } from '@sentry/core';
import { DEBUG_BUILD } from './debug-build';

export type TracingChannelPayloadWithSpan<TData extends object> = TData & {
  _sentrySpan?: Span;
};

/*
 * A type patch so that we don't have to handle all subscription types.
 */
export interface SentryTracingChannel<TData extends object = object> extends Omit<
  TracingChannel<TData, TracingChannelPayloadWithSpan<TData>>,
  'subscribe' | 'unsubscribe'
> {
  subscribe(subscribers: Partial<TracingChannelSubscribers<TracingChannelPayloadWithSpan<TData>>>): void;
  unsubscribe(subscribers: Partial<TracingChannelSubscribers<TracingChannelPayloadWithSpan<TData>>>): void;
}

export interface TracingChannelBindingOptions<TData extends object = object> {
  /**
   * Whether the span is ended automatically (`auto`, default) or left to the caller (`manual`).
   */
  lifecycle?: 'auto' | 'manual';

  /**
   * Invoked with the span and the channel context object once the traced operation completes
   * Use it to enrich the span from the result/error (branch on `'error' in data` / `'result' in data`) or to run cleanup.
   */
  beforeSpanEnd?: (span: Span, data: TracingChannelPayloadWithSpan<TData>) => void;

  /**
   * Whether a thrown error is captured as a Sentry event. The span is always marked with error
   * status regardless. Defaults to `true`.
   * Set `false` for instrumentation that only annotates the span and lets the error be captured at the boundary that owns it (e.g. db spans).
   */
  captureError?: boolean;
}

/** Returned by {@link bindTracingChannelToSpan}: the bound channel plus a teardown handle. */
export interface TracingChannelBindingHandle<TData extends object = object> {
  /** The tracing channel with the span bound into async context (and, in `auto` mode, its lifecycle subscribed). */
  channel: SentryTracingChannel<TData>;
  /**
   * Tears down the binding: unsubscribes the auto lifecycle handlers and unbinds the start store.
   * Idempotent, and a no-op when no async context binding was available.
   */
  unbind: () => void;
}

const NOOP = (): void => {};

export function bindTracingChannelToSpan<TData extends object>(
  channel: TracingChannel<TData, TData>,
  getSpan: (data: TracingChannelPayloadWithSpan<TData>) => Span,
  opts?: TracingChannelBindingOptions<TData>,
): TracingChannelBindingHandle<TData> {
  const sentryChannel = channel as SentryTracingChannel<TData>;
  const binding = _INTERNAL_getTracingChannelBinding();

  if (!binding) {
    DEBUG_BUILD && debug.log('[TracingChannel] Could not access async context binding.');
    return { channel: sentryChannel, unbind: NOOP };
  }

  const asyncLocalStorage = binding.asyncLocalStorage as AsyncLocalStorage<TData>;

  channel.start.bindStore(asyncLocalStorage, (data: TracingChannelPayloadWithSpan<TData>) => {
    const span = getSpan(data);
    data._sentrySpan = span;

    return binding.getStoreWithActiveSpan(span) as TData;
  });

  const unbindStore = (): void => {
    channel.start.unbindStore(asyncLocalStorage);
  };

  if (opts?.lifecycle === 'manual') {
    return { channel: sentryChannel, unbind: unbindStore };
  }

  const beforeSpanEnd = opts?.beforeSpanEnd;

  const subscribers: Partial<TracingChannelSubscribers<TracingChannelPayloadWithSpan<TData>>> = {
    start: NOOP,
    asyncStart: NOOP,
    end(data) {
      // The operation settled synchronously (returned or threw)
      // Presence checks because caller can return `undefined` result or throw a falsy value.
      if ('error' in data || 'result' in data) {
        endBoundSpan(data, beforeSpanEnd);
      }
    },
    error(data) {
      if (opts?.captureError !== false) {
        captureException(data.error, {
          mechanism: {
            type: 'auto.diagnostic_channels.bind_span',
            handled: false,
          },
        });
      }
      data._sentrySpan?.setStatus({ code: SPAN_STATUS_ERROR, message: getErrorMessage(data.error) });
    },
    asyncEnd(data) {
      endBoundSpan(data, beforeSpanEnd);
    },
  };

  sentryChannel.subscribe(subscribers);

  return {
    channel: sentryChannel,
    unbind: () => {
      sentryChannel.unsubscribe(subscribers);
      unbindStore();
    },
  };
}

function endBoundSpan<TData extends object>(
  data: TracingChannelPayloadWithSpan<TData>,
  beforeSpanEnd: TracingChannelBindingOptions<TData>['beforeSpanEnd'],
): void {
  const span = data._sentrySpan;
  if (!span) {
    return;
  }
  beforeSpanEnd?.(span, data);
  span.end();
}

/** Best-effort short message for a span status: an error-like's `message`, otherwise its string form. */
function getErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return String(error);
}
