import type { TracingChannel, TracingChannelSubscribers } from 'node:diagnostics_channel';
import type { AsyncLocalStorage } from 'node:async_hooks';
import type { ExclusiveEventHintOrCaptureContext, Span } from '@sentry/core';
import { debug, captureException, SPAN_STATUS_ERROR, getAsyncContextStrategy, getMainCarrier } from '@sentry/core';
import { DEBUG_BUILD } from './debug-build';
import { ERROR_TYPE } from '@sentry/conventions/attributes';

export type TracingChannelPayloadWithSpan<TData extends object> = TData & {
  /**
   * The current active span for the traced call.
   */
  _sentrySpan?: Span;

  /**
   * The context's active store value, used to restore the context for asyncStart continuations for callback-based tracing.
   */
  _sentryCallerStore?: unknown;
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
   * Whether a thrown error is captured as a Sentry event. The span is always marked with error status regardless. Defaults to `false`.
   * You can alternatively pass a function that sets the ExclusiveEventHintOrCaptureContext on the captured error.
   * Set `true` for instrumentations that own the error boundary, (e.g: route handlers)
   * For database drivers, it is not recommended to set this at all.
   */
  captureError?: boolean | ((e: unknown) => ExclusiveEventHintOrCaptureContext);

  /**
   * Take ownership of *when* the span ends: return `true` and the helper won't end it on
   * `end`/`asyncEnd`. For results that settle out-of-band — e.g. a streamed `EventEmitter` that
   * completes via its own `'end'`/`'error'` events.
   *
   * Call `end` when it settles — `end()` on success, `end(error)` on failure. `end` owns *how* the span
   * ends (error status/attributes, `captureError`, `beforeSpanEnd`) and is idempotent. Default `false`
   * lets the helper end the span as usual.
   */
  deferSpanEnd?: (args: {
    span: Span;
    data: TracingChannelPayloadWithSpan<TData>;
    /** Ends the span: `end()` on success, `end(error)` on failure. Idempotent. */
    end: (error?: unknown) => void;
  }) => boolean;
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
export function bindTracingChannelToSpan<TData extends object>(
  channel: TracingChannel<TData, TData>,
  getSpan: (data: TracingChannelPayloadWithSpan<TData>) => Span | undefined,
  opts?: TracingChannelLifeCycleOptions<TData>,
): TracingChannelBindingHandle<TData> {
  const handle = bindSpanToChannelStore(channel, getSpan);

  const beforeSpanEnd = opts?.beforeSpanEnd;
  const deferSpanEnd = opts?.deferSpanEnd;
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

  // Apply Sentry error status + attributes (and capture, if configured) to a span. Shared by the
  // channel `error` lifecycle and the deferred `end` util so the two can't drift.
  const annotateSpanError = (span: Span, error: unknown): void => {
    if (opts?.captureError) {
      captureException(error, getErrorHint(error));
    }

    const { message, attributes } = getErrorInfo(error);
    span.setStatus({ code: SPAN_STATUS_ERROR, message });
    span.setAttributes(attributes);
  };

  // Creates an end fn for deferred handlers to use, ensures consistent span end behavior
  const makeDeferredEnd = (span: Span, data: TracingChannelPayloadWithSpan<TData>) => {
    let ended = false;

    return (error?: unknown): void => {
      if (ended) {
        return;
      }

      ended = true;
      if (error !== undefined) {
        annotateSpanError(span, error);
      }

      endBoundSpan(data, beforeSpanEnd);
    };
  };

  const subscribers: Partial<TracingChannelSubscribers<TracingChannelPayloadWithSpan<TData>>> = {
    start: NOOP,
    asyncStart: NOOP,
    end(data) {
      // The operation settled synchronously (returned or threw)
      // Presence checks because caller can return `undefined` result or throw a falsy value.
      if ('error' in data || 'result' in data) {
        const span = data._sentrySpan;
        if (span && deferSpanEnd?.({ span, data, end: makeDeferredEnd(span, data) })) {
          return;
        }
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

      annotateSpanError(span, data.error);
    },
    asyncEnd(data) {
      const span = data._sentrySpan;
      if (span && deferSpanEnd?.({ span, data, end: makeDeferredEnd(span, data) })) {
        return;
      }
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
 * Bind a span into the channel's async context so it becomes active for the traced operation,
 * without managing its lifecycle. The primitive behind {@link bindTracingChannelToSpan}, which
 * layers span-ending and error handling on top.
 *
 * `getSpan` may return `undefined` to leave the active context untouched for that payload.
 */
function bindSpanToChannelStore<TData extends object>(
  channel: TracingChannel<TData, TData>,
  getSpan: (data: TracingChannelPayloadWithSpan<TData>) => Span | undefined,
): TracingChannelBindingHandle<TData> {
  // Grabs the tracing channel binding defined by the AsyncContext strategy implementation
  const binding = getAsyncContextStrategy(getMainCarrier()).getTracingChannelBinding?.();

  // If no binding, then either the implementer doesn't support tracing channels or there is no active strategy
  // Failure mode here means we would still access the channel and potentially subscribe to it, but parenting will be off.
  if (!binding) {
    DEBUG_BUILD && debug.log('[TracingChannel] Could not access async context binding.');

    return {
      channel,
      unbind: NOOP,
    };
  }

  // Grab the ALS instance, we don't really care what is in it as long as the AsyncContext strategy can use its value to figure out parenting.
  const asyncLocalStorage = binding.asyncLocalStorage as AsyncLocalStorage<TData>;

  // bindStore activates the ALS for the traced call; any getStore() inside it returns the value bound for that context.
  // 1. Produce: getStoreWithActiveSpan(span) clones the current scope, plants the span via _INTERNAL_setSpanForScope, and returns { scope, isolationScope }, the active context carrying our span.
  // 2. Bind: the courier hands that opaque value to channel.start.bindStore(asyncLocalStorage, producer), which runs the traced op inside asyncLocalStorage.run(value, …); it never inspects the value.
  // 3. Read: inside the op, Sentry's scope machinery calls getScopes() → asyncStorage.getStore() on that same ALS, so getCurrentScope/getIsolationScope/getActiveSpan resolve to the scope carrying our span.
  // 4. Nest: any child span started in the traced op parents to that active span.
  channel.start.bindStore(asyncLocalStorage, (data: TracingChannelPayloadWithSpan<TData>) => {
    // Stash the caller's store before we swap in the span store, so `asyncStart` can restore it for
    // callback-style channels (see `_sentryCallerStore`).
    data._sentryCallerStore = asyncLocalStorage.getStore();

    const span = getSpan(data);
    if (!span) {
      // Leave the active context untouched so nested operations keep parenting to the enclosing span.
      return data._sentryCallerStore as TData;
    }
    data._sentrySpan = span;

    return binding.getStoreWithActiveSpan(span) as TData;
  });

  // Restore the caller's context for the async continuation. Only callback-style channels `runStores`
  // `asyncStart` (so the callback runs inside this store). promise channels `publish` it, leaving this
  // inert, their continuation already inherits the caller's context natively.
  channel.asyncStart.bindStore(asyncLocalStorage, (data: TracingChannelPayloadWithSpan<TData>) => {
    return data._sentryCallerStore as TData;
  });

  return {
    channel,
    unbind: () => {
      // Removes the stores
      channel.start.unbindStore(asyncLocalStorage);
      channel.asyncStart.unbindStore(asyncLocalStorage);
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

type ErrorInfo = {
  message: string | undefined;
  attributes: Record<string, string>;
};

/**
 * Best-effort message and attribute extraction for thrown/rejected values.
 */
function getErrorInfo(error: unknown): ErrorInfo {
  const isObject = !!error && typeof error === 'object';
  const raw = isObject ? ('message' in error ? error.message : undefined) : error;

  // Leave the status message unset if not set (e.g. an `AggregateError` from
  // ECONNREFUSED, whose `.message` is empty). Otherwise cast to string.
  const message = raw ? String(raw) : undefined;
  const type = isObject && 'name' in error ? String(error.name) : 'unknown';

  return {
    message,
    attributes: {
      [ERROR_TYPE]: type,
    },
  };
}
