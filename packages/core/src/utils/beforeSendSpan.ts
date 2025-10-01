import type { ClientOptions, SpanV2CompatibleBeforeSendSpanCallback } from '../types-hoist/options';
import type { SpanV2JSON } from '../types-hoist/span';
import { addNonEnumerableProperty } from './object';

/**
 * A wrapper to use the new span format in your `beforeSendSpan` callback.
 *
 * @example
 *
 * Sentry.init({
 *   beforeSendSpan: makeV2Callback((span) => {
 *     return span;
 *   }),
 * });
 *
 * @param callback
 * @returns
 */
export function makeV2Callback(callback: (span: SpanV2JSON) => SpanV2JSON): SpanV2CompatibleBeforeSendSpanCallback {
  addNonEnumerableProperty(callback, '_v2', true);
  // type-casting here because TS can't infer the type correctly
  return callback as SpanV2CompatibleBeforeSendSpanCallback;
}

/**
 * Typesafe check to identify the expected span json format of the `beforeSendSpan` callback.
 */
export function isV2BeforeSendSpanCallback(
  callback: ClientOptions['beforeSendSpan'],
): callback is SpanV2CompatibleBeforeSendSpanCallback {
  return !!callback && '_v2' in callback && !!callback._v2;
}
