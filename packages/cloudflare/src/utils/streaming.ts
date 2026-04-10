export type StreamingGuess = {
  isStreaming: boolean;
};

/**
 * Classifies a Response as streaming or non-streaming.
 *
 * Heuristics:
 * - No body → not streaming
 * - Known streaming Content-Types → streaming (SSE, NDJSON, JSON streaming)
 * - Otherwise → not streaming (conservative default, including HTML/SSR)
 *
 * We avoid probing the stream to prevent blocking on transform streams (like injectTraceMetaTags)
 * or SSR streams that may not have data ready immediately.
 */
export function classifyResponseStreaming(res: Response): StreamingGuess {
  if (!res.body) {
    return { isStreaming: false };
  }

  const contentType = res.headers.get('content-type') ?? '';

  // Streaming: Known streaming content types
  // - text/event-stream: Server-Sent Events (Vercel AI SDK, real-time APIs)
  // - application/x-ndjson, application/ndjson: Newline-delimited JSON
  // - application/stream+json: JSON streaming
  if (
    /^text\/event-stream\b/i.test(contentType) ||
    /^application\/(x-)?ndjson\b/i.test(contentType) ||
    /^application\/stream\+json\b/i.test(contentType)
  ) {
    return { isStreaming: true };
  }

  // Default: treat as non-streaming
  return { isStreaming: false };
}
