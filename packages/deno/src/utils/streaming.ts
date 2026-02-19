import type { Span } from '@sentry/core';

export type StreamingGuess = {
  isStreaming: boolean;
};

/**
 * Classifies a Response as streaming or non-streaming.
 *
 * Heuristics:
 * - No body → not streaming
 * - Known streaming Content-Types → streaming (SSE, NDJSON, JSON streaming)
 * - text/plain without Content-Length → streaming (some AI APIs)
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
  const contentLength = res.headers.get('content-length');

  // Streaming: Known streaming content types
  // - text/event-stream: Server-Sent Events (Vercel AI SDK, real-time APIs)
  // - application/x-ndjson, application/ndjson: Newline-delimited JSON
  // - application/stream+json: JSON streaming
  // - text/plain (without Content-Length): Some AI APIs use this for streaming text
  if (
    /^text\/event-stream\b/i.test(contentType) ||
    /^application\/(x-)?ndjson\b/i.test(contentType) ||
    /^application\/stream\+json\b/i.test(contentType) ||
    (/^text\/plain\b/i.test(contentType) && !contentLength)
  ) {
    return { isStreaming: true };
  }

  // Default: treat as non-streaming
  return { isStreaming: false };
}

/**
 * Tee a stream, and end the provided span when the stream ends.
 * Returns the other side of the tee, which can be used to send the
 * response to a client.
 */
export async function streamResponse(span: Span, res: Response): Promise<Response> {
  const classification = classifyResponseStreaming(res);

  // not streaming, just end the span and return the response
  if (!classification.isStreaming || !res.body) {
    span.end();
    return res;
  }

  // Streaming response detected - monitor consumption to keep span alive
  try {
    return new Response(
      monitorStream(res.body, () => span.end()),
      {
        status: res.status,
        statusText: res.statusText,
        headers: res.headers,
      },
    );
  } catch (e) {
    // tee() failed - handle without streaming
    span.end();
    return res;
  }
}

/**
 * zero-copy monitoring of stream progress.
 */
function monitorStream(
  stream: ReadableStream<Uint8Array<ArrayBufferLike>>,
  onDone: () => void,
): ReadableStream<Uint8Array<ArrayBufferLike>> {
  const reader = stream.getReader();
  // oxlint-disable-next-line typescript/no-floating-promises
  reader.closed.finally(() => onDone());
  return new ReadableStream({
    async start(controller) {
      let result: ReadableStreamReadResult<Uint8Array<ArrayBufferLike>>;
      do {
        result = await reader.read();
        if (result.value) {
          try {
            controller.enqueue(result.value);
          } catch (er) {
            controller.error(er);
            reader.releaseLock();
            return;
          }
        }
      } while (!result.done);
      controller.close();
      reader.releaseLock();
    },
  });
}
