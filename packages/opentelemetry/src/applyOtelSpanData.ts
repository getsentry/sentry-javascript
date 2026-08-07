import {
  getClient,
  hasSpanStreamingEnabled,
  spanToJSON,
  SPAN_STATUS_ERROR,
  SPAN_STATUS_OK,
  isStatusErrorMessageValid,
} from '@sentry/core';
import type { RawAttributes, Span } from '@sentry/core';
import { inferStatusFromAttributes } from './utils/mapStatus';

/**
 * Backfill a native Sentry span with the data the OpenTelemetry SDK pipeline would otherwise derive
 * from OTel semantic attributes.
 */
export function applyOtelSpanData(span: Span, options: { finalizeStatus?: boolean } = {}): void {
  const spanJSON = spanToJSON(span);
  const attributes = spanJSON.attributes;

  if (options.finalizeStatus) {
    const client = getClient();
    applyOtelSpanStatus(span, attributes, spanJSON.status, !!client && hasSpanStreamingEnabled(client));
  }
}

function applyOtelSpanStatus(
  span: Span,
  attributes: RawAttributes<Record<string, unknown>>,
  status: string,
  spanStreamingEnabled: boolean,
): void {
  if (status === 'ok') {
    span.setStatus(inferStatusFromAttributes(attributes) || { code: SPAN_STATUS_OK });
    return;
  }

  // Normalize a non-canonical error message to `internal_error` for the (non-streamed) transaction
  // `status` field, matching the OTel SDK exporter's `mapStatus`. Skip this under span streaming: the
  // streamed serializer preserves the raw message as `sentry.status.message` by reading the live span
  // status, and the OTel SDK path keeps it too because `mapStatus` maps at export without mutating the
  // span. Overwriting it here would replace that message with `internal_error`.
  if (!spanStreamingEnabled && status !== 'ok' && !isStatusErrorMessageValid(status)) {
    span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
  }
}
