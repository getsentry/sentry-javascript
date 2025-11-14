export type StreamingGuess = {
  response: Response;
  isStreaming: boolean;
};

/**
 * Classifies a Response as streaming or non-streaming.
 *
 * Uses multiple heuristics:
 * - No body → not streaming
 * - Content-Type: text/event-stream → streaming
 * - Content-Length header present → not streaming
 * - Otherwise: attempts immediate read to detect behavior
 *   - Stream empty (done) → not streaming
 *   - Got data without Content-Length → streaming
 *   - Got data with Content-Length → not streaming
 *
 * Note: Probing will tee() the stream and return a new Response object.
 *
 * @param res - The Response to classify
 * @returns Classification result with safe-to-return Response
 */
export async function classifyResponseStreaming(res: Response): Promise<StreamingGuess> {
  if (!res.body) {
    return { response: res, isStreaming: false };
  }

  const contentType = res.headers.get('content-type') ?? '';
  const contentLength = res.headers.get('content-length');

  // Fast path: Server-Sent Events
  if (/^text\/event-stream\b/i.test(contentType)) {
    return { response: res, isStreaming: true };
  }

  // Fast path: Content-Length indicates buffered response
  if (contentLength && /^\d+$/.test(contentLength)) {
    return { response: res, isStreaming: false };
  }

  // Probe the stream by trying to read first chunk immediately
  // After tee(), must use the teed stream (original is locked)
  const [probeStream, passStream] = res.body.tee();
  const reader = probeStream.getReader();

  try {
    const { done } = await reader.read();
    reader.releaseLock();

    const teededResponse = new Response(passStream, res);

    if (done) {
      // Stream completed immediately - buffered (empty body)
      return { response: teededResponse, isStreaming: false };
    }

    // Got data - treat as streaming if no Content-Length header
    return { response: teededResponse, isStreaming: contentLength == null };
  } catch {
    reader.releaseLock();
    // Error reading - treat as non-streaming to be safe
    return { response: new Response(passStream, res), isStreaming: false };
  }
}
