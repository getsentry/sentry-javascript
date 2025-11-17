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
 * - Otherwise: attempts immediate read with timeout to detect behavior
 *   - Timeout (no data ready) → not streaming (typical SSR/buffered response)
 *   - Stream empty (done) → not streaming
 *   - Got data without Content-Length → streaming (e.g., Vercel AI SDK)
 *   - Got data with Content-Length → not streaming
 *
 * The timeout prevents blocking on responses that are being generated (like SSR),
 * while still detecting true streaming responses that produce data immediately.
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

  // Probe the stream by trying to read first chunk immediately with a timeout
  // After tee(), must use the teed stream (original is locked)
  const [probeStream, passStream] = res.body.tee();
  const reader = probeStream.getReader();

  try {
    // Use a short timeout to avoid blocking on responses that aren't immediately ready
    // Streaming responses (like Vercel AI) typically start producing data right away
    // Buffered responses (like Remix SSR) will block until content is generated
    const PROBE_TIMEOUT_MS = 10;

    const timeoutPromise = new Promise<{ done: boolean; value?: unknown; timedOut: true }>(resolve => {
      setTimeout(() => resolve({ done: false, value: undefined, timedOut: true }), PROBE_TIMEOUT_MS);
    });

    const readPromise = reader.read().then(result => ({ ...result, timedOut: false as const }));
    const result = await Promise.race([readPromise, timeoutPromise]);

    reader.releaseLock();

    const teededResponse = new Response(passStream, res);

    if (result.timedOut) {
      // Timeout means data isn't immediately available - likely a buffered response
      // being generated (like SSR). Treat as non-streaming.
      return { response: teededResponse, isStreaming: false };
    }

    if (result.done) {
      // Stream completed immediately - buffered (empty body)
      return { response: teededResponse, isStreaming: false };
    }

    // Got data immediately without Content-Length - likely streaming
    // Got data immediately with Content-Length - buffered
    return { response: teededResponse, isStreaming: contentLength == null };
  } catch {
    reader.releaseLock();
    // Error reading - treat as non-streaming to be safe
    return { response: new Response(passStream, res), isStreaming: false };
  }
}
