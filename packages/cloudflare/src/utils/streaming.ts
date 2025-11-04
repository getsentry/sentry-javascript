export type StreamingGuess = {
  response: Response;
  isStreaming: boolean;
};

/**
 *
 */
export async function classifyResponseStreaming(
  res: Response,
  opts: { timeoutMs?: number } = {},
): Promise<StreamingGuess> {
  const timeoutMs = opts.timeoutMs ?? 25;

  if (!res.body) {
    return { response: res, isStreaming: false };
  }

  const ct = res.headers.get('content-type') ?? '';
  const cl = res.headers.get('content-length');

  // Definitive streaming indicators
  if (/^text\/event-stream\b/i.test(ct)) {
    return { response: res, isStreaming: true };
  }

  // Definitive non-streaming indicators
  if (cl && /^\d+$/.test(cl)) {
    return { response: res, isStreaming: false };
  }

  // Probe the stream to detect streaming behavior
  // NOTE: This tees the stream and returns a new Response object
  const [probe, pass] = res.body.tee();
  const reader = probe.getReader();

  const firstChunkPromise = (async () => {
    try {
      const { value, done } = await reader.read();
      reader.releaseLock();
      if (done) return { arrivedBytes: 0, done: true };
      const bytes =
        value && typeof value === 'object' && 'byteLength' in value ? (value as { byteLength: number }).byteLength : 0;
      return { arrivedBytes: bytes, done: false };
    } catch {
      return { arrivedBytes: 0, done: false };
    }
  })();

  const timeout = new Promise<{ arrivedBytes: number; done: boolean }>(r =>
    setTimeout(() => r({ arrivedBytes: 0, done: false }), timeoutMs),
  );

  const peek = await Promise.race([firstChunkPromise, timeout]);

  // We must return the teed response since original is now locked
  const preserved = new Response(pass, res);

  let isStreaming = false;
  if (peek.done) {
    // Stream completed immediately
    isStreaming = false;
  } else if (peek.arrivedBytes === 0) {
    // Timeout waiting for first chunk - definitely streaming
    isStreaming = true;
  } else {
    // Got first chunk - streaming if no Content-Length
    isStreaming = cl == null;
  }

  return { response: preserved, isStreaming };
}
