import type { TracingChannel, TracingChannelSubscribers } from 'node:diagnostics_channel';
import type { AsyncLocalStorage } from 'node:async_hooks';
import type { ExclusiveEventHintOrCaptureContext, Span } from '@sentry/core';
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

export interface TracingChannelLifeCycleOptions<TData extends object = object> {
  /**
   * Invoked with the span and the channel context object once the traced operation completes
   * Use it to enrich the span from the result/error (branch on `'error' in data` / `'result' in data`) or to run cleanup.
   */
  beforeSpanEnd?: (span: Span, data: TracingChannelPayloadWithSpan<TData>) => void;

  /**
   * Whether a thrown error is captured as a Sentry event. The span is always marked with error status regardless. Defaults to `true`.
   * You can alternatively pass a function that sets the ExclusiveEventHintOrCaptureContext on the captured error.
   * Set `false` for instrumentation that only annotates the span and lets the error be captured at the boundary that owns it (e.g. db spans).
   */
  captureError?: boolean | ((e: unknown) => ExclusiveEventHintOrCaptureContext);
}

/** Returned by {@link bindTracingChannelToSpan}: the bound channel plus a teardown handle. */
export interface TracingChannelBindingHandle<TData extends object = object> {
  /**
   * The tracing channel with the span bound into async context.
   */
  channel: SentryTracingChannel<TData>;

  /**
   * Tears down the binding: unsubscribes lifecycle handlers, when present, and unbinds the start store.
   * Idempotent, and a no-op when no async context binding was available.
   */
  unbind: () => void;
}

const NOOP = (): void => {};

/**
 * Bind a span and its lifecycle to a tracing channel so the span becomes the active async context
 * for the traced operation and is ended when the operation completes.
 *
 * `getSpan` may return `undefined` to opt a payload out entirely: nothing is bound, no span is
 * tracked, and the active context is left untouched. Use it for events that ride the same channel
 * but should reuse the enclosing span instead of opening (and ending) their own — e.g. an agent
 * loop's per-step events, where ending a freshly opened span would close the parent prematurely.
 */
export function bindTracingChannelToSpanWithLifeCycle<TData extends object>(
  channel: TracingChannel<TData, TData>,
  getSpan: (data: TracingChannelPayloadWithSpan<TData>) => Span | undefined,
  opts?: TracingChannelLifeCycleOptions<TData>,
): TracingChannelBindingHandle<TData> {
  const handle = bindTracingChannelToSpan(channel, getSpan);

  const beforeSpanEnd = opts?.beforeSpanEnd;
  const getErrorHint = (e: unknown): ExclusiveEventHintOrCaptureContext => {
    if (typeof opts?.captureError === 'function') {
      return opts.captureError(e);
    }

    return {
      mechanism: {
        type: 'auto.diagnostic_channels.bind_span',
        handled: false,
      },
    };
  };

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
      // No span was bound for this payload (`getSpan` returned undefined), so there is nothing to
      // annotate and no instrumentation that owns capturing this error.
      const span = data._sentrySpan;
      if (!span) {
        return;
      }

      if (opts?.captureError !== false) {
        captureException(data.error, getErrorHint(data.error));
      }

      span.setStatus({ code: SPAN_STATUS_ERROR, message: getErrorMessage(data.error) });
    },
    asyncEnd(data) {
      endBoundSpan(data, beforeSpanEnd);
    },
  };

  handle.channel.subscribe(subscribers);

  return {
    channel: handle.channel,
    unbind: () => {
      handle.channel.unsubscribe(subscribers);
      handle.unbind();
    },
  };
}

/**
 * Bind a span to a tracing channel so the span becomes the active async context for the traced
 * operation. The caller owns the span lifecycle and any error handling.
 *
 * `getSpan` may return `undefined` to leave the active context untouched for that payload.
 */
export function bindTracingChannelToSpan<TData extends object>(
  channel: TracingChannel<TData, TData>,
  getSpan: (data: TracingChannelPayloadWithSpan<TData>) => Span | undefined,
): TracingChannelBindingHandle<TData> {
  const binding = _INTERNAL_getTracingChannelBinding();

  if (!binding) {
    DEBUG_BUILD && debug.log('[TracingChannel] Could not access async context binding.');

    return {
      channel,
      unbind: NOOP,
    };
  }

  const asyncLocalStorage = binding.asyncLocalStorage as AsyncLocalStorage<TData>;

  channel.start.bindStore(asyncLocalStorage, (data: TracingChannelPayloadWithSpan<TData>) => {
    const span = getSpan(data);
    if (!span) {
      // Leave the active context untouched so nested operations keep parenting to the enclosing span.
      return asyncLocalStorage.getStore() as TData;
    }
    data._sentrySpan = span;

    return binding.getStoreWithActiveSpan(span) as TData;
  });

  return {
    channel,
    unbind: () => {
      // Removes the store
      channel.start.unbindStore(asyncLocalStorage);
    },
  };
}

function endBoundSpan<TData extends object>(
  data: TracingChannelPayloadWithSpan<TData>,
  beforeSpanEnd: TracingChannelLifeCycleOptions<TData>['beforeSpanEnd'],
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
