import type { Span } from '@sentry/core';
import { classifyResponseStreaming } from '@sentry/core/server';

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
  } catch {
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
  reader.closed.then(
    () => onDone(),
    () => onDone(),
  );
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
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}
