import { expect } from '@playwright/test';

const AGENT_ID = 'weatherAgent';

/**
 * Drive one agent turn through Mastra's built-in generate endpoint and wait for it
 * to settle. `generate` runs to completion server-side before the response is sent,
 * so once the POST resolves the run is finished and its spans have been created; we
 * then only wait for the envelopes to reach the proxy.
 *
 * `thread`/`resource` are sent as the nested `memory: { thread, resource }` shape —
 * the modern `generate` path. That is what makes Mastra stamp the thread id onto the
 * spans (→ `gen_ai.conversation.id`). NOTE: top-level `threadId`/`resourceId` would
 * instead route to the deprecated `generateLegacy` path, which the AI instrumentation
 * does not cover — so the nested shape is required here.
 */
export async function runAgentTurn(
  baseURL: string,
  message: string,
  options: { thread?: string; resource?: string } = {},
): Promise<{ status: number }> {
  const res = await fetch(`${baseURL}/api/agents/${AGENT_ID}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: message,
      ...(options.thread ? { memory: { thread: options.thread, resource: options.resource ?? 'e2e-user' } } : {}),
    }),
  });
  // A 404 means the endpoint/agent id is wrong — surface that instead of timing out
  // later on missing spans. Success is 200; a bubbled-up tool error yields a 500,
  // which the error test exercises on purpose.
  expect(res.status).not.toBe(404);
  await res.text();
  return { status: res.status };
}
