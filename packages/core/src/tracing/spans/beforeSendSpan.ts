import type { BeforeSendStramedSpanCallback, ClientOptions } from '../../types-hoist/options';
import type { StreamedSpanJSON } from '../../types-hoist/span';
import { addNonEnumerableProperty } from '../../utils/object';

/**
 * A wrapper to use the new span format in your `beforeSendSpan` callback.
 *
 * When using `traceLifecycle: 'stream'`, wrap your callback with this function
 * to receive and return {@link StreamedSpanJSON} instead of the standard {@link SpanJSON}.
 *
 * @example
 *
 * Sentry.init({
 *   traceLifecycle: 'stream',
 *   beforeSendSpan: withStreamedSpan((span) => {
 *     // span is of type StreamedSpanJSON
 *     return span;
 *   }),
 * });
 *
 * @param callback - The callback function that receives and returns a {@link StreamedSpanJSON}.
 * @returns A callback that is compatible with the `beforeSendSpan` option when using `traceLifecycle: 'stream'`.
 */
export function withStreamedSpan(
  callback: (span: StreamedSpanJSON) => StreamedSpanJSON,
): BeforeSendStramedSpanCallback {
  addNonEnumerableProperty(callback, '_streamed', true);
  return callback;
}

/**
 * Typesafe check to identify if a `beforeSendSpan` callback expects the streamed span JSON format.
 *
 * @param callback - The `beforeSendSpan` callback to check.
 * @returns `true` if the callback was wrapped with {@link withStreamedSpan}.
 */
export function isStreamedBeforeSendSpanCallback(
  callback: ClientOptions['beforeSendSpan'],
): callback is BeforeSendStramedSpanCallback {
  return !!callback && '_streamed' in callback && !!callback._streamed;
}
