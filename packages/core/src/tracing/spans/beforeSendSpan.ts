import { DEBUG_BUILD } from '../../debug-build';
import type { BeforeSendStaticSpanCallback, BeforeSendStreamedSpanCallback } from '../../types/options';
import type { SpanJSON, StreamedSpanJSON } from '../../types/span';
import { addNonEnumerableProperty } from '../../utils/object';
import { consoleSandbox } from '../../utils/debug-logger';
import { safeCallback } from '../../utils/safeCallback';

/**
 * A wrapper to use the static, transaction-based span format in your `beforeSendSpan` callback.
 *
 * When using `traceLifecycle: 'static'`, wrap your callback with this function
 * to receive and return a static span instead of a {@link StreamedSpanJSON}.
 *
 * @example
 *
 * Sentry.init({
 *   traceLifecycle: 'static',
 *   beforeSendSpan: withStaticSpan((span) => {
 *     // span is of type SpanJSON
 *     return span;
 *   }),
 * });
 *
 * @param callback - A {@link BeforeSendStaticSpanCallback} that receives and returns a static span.
 * @returns A callback that is compatible with the `beforeSendSpan` option when using `traceLifecycle: 'static'`.
 */
export function withStaticSpan(callback: BeforeSendStaticSpanCallback): BeforeSendStreamedSpanCallback {
  addNonEnumerableProperty(callback, '_static', true);
  // `beforeSendSpan` is typed as a single streamed callback so that an unwrapped callback's parameter
  // is contextually typed as `StreamedSpanJSON`. The `_static` marker tells the SDK to hand this
  // callback a `SpanJSON` instead, so the declared parameter type is deliberately not what it receives.
  return callback as unknown as BeforeSendStreamedSpanCallback;
}

/**
 * A wrapper to explicitly use the streamed span format in your `beforeSendSpan` callback.
 *
 * @deprecated `beforeSendSpan` callbacks receive {@link StreamedSpanJSON} by default.
 * This function returns the callback unchanged and will be removed in SDK version 12.
 *
 * @param callback - The callback function that receives and returns a {@link StreamedSpanJSON}.
 * @returns The provided callback.
 */
export function withStreamedSpan(
  callback: (span: StreamedSpanJSON) => StreamedSpanJSON,
): BeforeSendStreamedSpanCallback {
  return callback;
}

/**
 * Typesafe check to identify if a `beforeSendSpan` callback expects the static span JSON format.
 *
 * @param callback - The `beforeSendSpan` callback to check.
 * @returns `true` if the callback was wrapped with {@link withStaticSpan}.
 */
export function isStaticBeforeSendSpanCallback(callback: unknown): callback is BeforeSendStaticSpanCallback {
  return !!callback && typeof callback === 'function' && '_static' in callback && !!callback._static;
}

let hasShownSpanDropWarning = false;
/**
 * Apply a user-provided beforeSendSpan callback to a span JSON.
 */
export function applyBeforeSendSpanCallback<T extends StreamedSpanJSON | SpanJSON>(
  span: T,
  beforeSendSpan: (span: T) => T,
): T {
  // Spans are captured synchronously when they end, so a throwing callback would otherwise
  // propagate into whatever user code ended the span.
  const modifiedSpan = safeCallback(
    DEBUG_BUILD ? 'The `beforeSendSpan` callback threw an error, sending the span unmodified:' : '',
    () => beforeSendSpan(span),
    () => span,
  );
  if (modifiedSpan) {
    return modifiedSpan;
  }

  if (!hasShownSpanDropWarning) {
    consoleSandbox(() => {
      // eslint-disable-next-line no-console
      console.warn(
        '[Sentry] Returning null from `beforeSendSpan` is disallowed. To drop certain spans, configure the respective integrations directly or use `ignoreSpans`.',
      );
    });
    hasShownSpanDropWarning = true;
  }
  return span;
}
