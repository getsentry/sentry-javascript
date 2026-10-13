import { expect } from '@playwright/test';

/**
 * Drive one agent turn through the worker's `/generate` route and wait for it to
 * settle. `generate` runs to completion before the response is sent, so once the POST
 * resolves the run is finished and its spans have been created; we then only wait for
 * the envelopes to reach the proxy.
 *
 * `thread`/`resource` are forwarded as the nested `memory: { thread, resource }` shape
 * (see src/index.ts) — the modern `generate` path that makes Mastra stamp the thread id
 * onto the spans (→ `gen_ai.conversation.id`).
 */
export async function runAgentTurn(
  baseURL: string,
  message: string,
  options: { thread?: string; resource?: string } = {},
): Promise<{ status: number }> {
  const res = await fetch(`${baseURL}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      ...(options.thread ? { thread: options.thread, resource: options.resource } : {}),
    }),
  });
  // A 404 means the route is wrong — surface that instead of timing out later on
  // missing spans. A bubbled-up tool error yields a 500, which the error test
  // exercises on purpose.
  expect(res.status).not.toBe(404);
  await res.text();
  return { status: res.status };
}
