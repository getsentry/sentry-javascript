import type { BeforeSendStaticSpanCallback, BeforeSendStreamedSpanCallback } from '../../types/options';
import type { SpanJSON, StreamedSpanJSON } from '../../types/span';
import { addNonEnumerableProperty } from '../../utils/object';

/**
 * A wrapper to use the legacy transaction span format in your `beforeSendSpan` callback.
 *
 * When using `traceLifecycle: 'static'`, wrap your callback with this function
 * to receive and return {@link SpanJSON} instead of {@link StreamedSpanJSON}.
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
 * @param callback - The callback function that receives and returns a {@link SpanJSON}.
 * @returns A callback that is compatible with the `beforeSendSpan` option when using `traceLifecycle: 'static'`.
 */
export function withStaticSpan(callback: (span: SpanJSON) => SpanJSON): BeforeSendStaticSpanCallback {
  addNonEnumerableProperty(callback, '_static', true);
  return callback as BeforeSendStaticSpanCallback;
}

/**
 * A wrapper to explicitly use the streamed span format in your `beforeSendSpan` callback.
 *
 * @deprecated `beforeSendSpan` callbacks receive {@link StreamedSpanJSON} by default.
 * This function will be removed in SDK version 12.
 *
 * @param callback - The callback function that receives and returns a {@link StreamedSpanJSON}.
 * @returns The provided callback.
 */
export function withStreamedSpan(
  callback: (span: StreamedSpanJSON) => StreamedSpanJSON,
): BeforeSendStreamedSpanCallback & { _streamed: true } {
  addNonEnumerableProperty(callback, '_streamed', true);
  return callback as BeforeSendStreamedSpanCallback & { _streamed: true };
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

/**
 * Typesafe check to identify if a `beforeSendSpan` callback expects the streamed span JSON format.
 *
 * @param callback - The `beforeSendSpan` callback to check.
 * @returns `true` unless the callback was wrapped with {@link withStaticSpan}.
 */
export function isStreamedBeforeSendSpanCallback(callback: unknown): callback is BeforeSendStreamedSpanCallback {
  return !!callback && typeof callback === 'function' && !isStaticBeforeSendSpanCallback(callback);
}
