import { spanToJSON, timestampInSeconds } from '@sentry/core';
import type { Span } from '@sentry/core';
import { GEN_AI_RESPONSE_TIME_TO_FIRST_CHUNK } from '@sentry/conventions/attributes';

/**
 * Sets `gen_ai.response.time_to_first_chunk` on a streamed span, in seconds from the span start.
 * Call it for each received chunk. Only the first call per span records a value.
 */
export function recordTimeToFirstChunk(span: Span): void {
  const { attributes, start_timestamp } = spanToJSON(span);
  if (attributes[GEN_AI_RESPONSE_TIME_TO_FIRST_CHUNK] === undefined) {
    span.setAttribute(GEN_AI_RESPONSE_TIME_TO_FIRST_CHUNK, timestampInSeconds() - start_timestamp);
  }
}
