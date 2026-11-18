import type { SerializedStreamedSpan } from '@sentry-internal/test-utils';
import { getSpanOp } from '@sentry-internal/test-utils';
import { HTTP_SERVER } from '@sentry/conventions/op';

/**
 * Returns the `http.server` spans of a request. In dev, the dev server process is instrumented through `--import`
 * too, and sends its own `GET` segment for the request it forwards to Nitro, so only the request's segment counts.
 */
export function getHttpServerSpans(
  spans: SerializedStreamedSpan[],
  segmentSpan: SerializedStreamedSpan | undefined,
): SerializedStreamedSpan[] {
  const isDev = process.env.TEST_ENV?.startsWith('dev') ?? false;

  return spans.filter(
    span =>
      getSpanOp(span) === HTTP_SERVER &&
      (!isDev || span.attributes['sentry.segment.id']?.value === segmentSpan?.span_id),
  );
}
