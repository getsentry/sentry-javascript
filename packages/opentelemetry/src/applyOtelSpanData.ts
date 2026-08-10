import { spanToJSON, SPAN_STATUS_OK } from '@sentry/core';
import type { Span } from '@sentry/core';
import { inferStatusFromAttributes } from './utils/mapStatus';

/**
 * Backfill a native Sentry span with the data the OpenTelemetry SDK pipeline would otherwise derive
 * from OTel semantic attributes.
 */
export function applyOtelSpanData(span: Span, options: { finalizeStatus?: boolean } = {}): void {
  const spanJSON = spanToJSON(span);

  // A non-canonical error message is preserved as-is: the streamed serializer keeps the raw message
  // as `sentry.status.message` by reading the live span status.
  if (options.finalizeStatus && spanJSON.status === 'ok') {
    span.setStatus(inferStatusFromAttributes(spanJSON.data) || { code: SPAN_STATUS_OK });
  }
}
