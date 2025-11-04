export type StreamingGuess = {
  response: Response;
  isStreaming: boolean;
};

/**
 * Classifies a Response as streaming or non-streaming.
 *
 * Uses multiple heuristics:
 * - Content-Type: text/event-stream → streaming
 * - Content-Length header present → not streaming
 * - Otherwise: probes stream with timeout to detect behavior
 *
 * Note: Probing will tee() the stream and return a new Response object.
 *
 * @param res - The Response to classify
 * @param opts.timeoutMs - Probe timeout in ms (default: 25)
 * @returns Classification result with safe-to-return Response
 */
export async function classifyResponseStreaming(
  res: Response,
  opts: { timeoutMs?: number } = {},
): Promise<StreamingGuess> {
  const timeoutMs = opts.timeoutMs ?? 25;

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

  // Uncertain - probe the stream to determine behavior
  // After tee(), must use the teed stream (original is locked)
  const [probeStream, passStream] = res.body.tee();
  const reader = probeStream.getReader();

  const probeResult = await Promise.race([
    // Try to read first chunk
    (async () => {
      try {
        const { value, done } = await reader.read();
        reader.releaseLock();

        if (done) {
          return { arrivedBytes: 0, done: true };
        }

        const bytes =
          value && typeof value === 'object' && 'byteLength' in value
            ? (value as { byteLength: number }).byteLength
            : 0;
        return { arrivedBytes: bytes, done: false };
      } catch {
        return { arrivedBytes: 0, done: false };
      }
    })(),
    // Timeout if first chunk takes too long
    new Promise<{ arrivedBytes: number; done: boolean }>(resolve =>
      setTimeout(() => resolve({ arrivedBytes: 0, done: false }), timeoutMs),
    ),
  ]);

  const teededResponse = new Response(passStream, res);

  // Determine if streaming based on probe result
  if (probeResult.done) {
    // Stream completed immediately - buffered
    return { response: teededResponse, isStreaming: false };
  } else if (probeResult.arrivedBytes === 0) {
    // Timeout waiting - definitely streaming
    return { response: teededResponse, isStreaming: true };
  } else {
    // Got chunk quickly - streaming if no Content-Length
    return { response: teededResponse, isStreaming: contentLength == null };
  }
}
