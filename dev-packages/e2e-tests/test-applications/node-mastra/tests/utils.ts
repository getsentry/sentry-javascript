import { expect } from '@playwright/test';

/**
 * Drive one agent turn through the app's custom `/run` route and wait for it to
 * settle. `generate` runs to completion server-side before the response is sent,
 * so once the POST resolves the run is finished and its spans have been created;
 * we then only wait for the envelopes to reach the proxy.
 *
 * `thread`/`resource` are passed to `generate` as `memory: { thread, resource }`,
 * which is what makes Mastra stamp the thread id onto the spans (→
 * `gen_ai.conversation.id`).
 */
export async function runAgentTurn(
  baseURL: string,
  message: string,
  options: { thread?: string; resource?: string } = {},
): Promise<{ status: number }> {
  const res = await fetch(`${baseURL}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, ...options }),
  });
  // 200 on success; a bubbled-up tool error yields a 500 (the error test relies
  // on that). Either is fine — callers assert on spans/errors, not this status.
  expect([200, 500]).toContain(res.status);
  await res.text();
  return { status: res.status };
}
