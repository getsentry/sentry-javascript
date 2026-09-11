import { expect } from '@playwright/test';

/**
 * Drive one agent turn through eve's default HTTP channel and wait for it to
 * settle, so the agent has finished and its spans have been flushed before we
 * assert. eve runs the turn in a durable workflow, so the POST only needs to be
 * accepted; we drain the event stream to know when the turn is done.
 */
export async function runAgentTurn(baseURL: string, message: string): Promise<void> {
  const createRes = await fetch(`${baseURL}/eve/v1/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  expect(createRes.status).toBe(202);
  const { sessionId } = (await createRes.json()) as { sessionId: string };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const streamRes = await fetch(`${baseURL}/eve/v1/session/${sessionId}/stream`, {
      signal: controller.signal,
    });
    const reader = streamRes.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      if (buffer.includes('"type":"session.waiting"') || buffer.includes('"type":"turn.failed"')) {
        break;
      }
    }
    await reader.cancel().catch(() => {});
  } finally {
    clearTimeout(timer);
  }
}
