import { expect } from '@playwright/test';

/**
 * Start one agent turn over Flue's agent router.
 *
 * `createAgentRouter` mounts `POST /:id`, which accepts the prompt and returns `202` with a
 * `streamUrl` — the turn itself runs afterwards. So this only starts the work; callers wait on the
 * spans they expect, which `collectStreamedSpans` accumulates across envelopes.
 *
 * The conversation id is ours to choose: it is the `:id` path segment.
 */
export async function runAgentTurn(baseURL: string, conversationId: string, message: string): Promise<void> {
  const res = await fetch(`${baseURL}/agents/hello/${conversationId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'user', body: message }),
  });

  expect(res.status).toBe(202);
  await res.text();
}
